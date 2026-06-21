import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@wolfchow/auth'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

const BACKOFF_INITIAL_MS = 1_000
const BACKOFF_CAP_MS = 30_000

export type RealtimeStatus = 'connected' | 'reconnecting' | 'disconnected'
export type RealtimeEventHandler = (event: string, payload: Record<string, unknown>) => void

export interface RealtimeContextValue {
  status: RealtimeStatus
  connected: boolean
  subscribe(event: string, handler: RealtimeEventHandler): () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { restaurantId } = useAuth()
  const [status, setStatus] = useState<RealtimeStatus>('disconnected')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const handlersRef = useRef<Map<string, Set<RealtimeEventHandler>>>(new Map())
  const backoffRef = useRef<number>(BACKOFF_INITIAL_MS)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const supabase = useMemo(
    () => (SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null),
    [],
  )

  useEffect(() => {
    mountedRef.current = true
    if (!supabase || !restaurantId) return

    function connect() {
      if (!supabase || !restaurantId || !mountedRef.current) return

      const channel = supabase
        .channel(`orders:${restaurantId}`)
        .on(
          'broadcast',
          { event: '*' },
          ({ event, payload }: { event: string; payload: Record<string, unknown> }) => {
            const handlers = handlersRef.current.get(event)
            handlers?.forEach((h) => h(event, payload))
            const allHandlers = handlersRef.current.get('*')
            allHandlers?.forEach((h) => h(event, payload))
          },
        )
        .subscribe((subStatus) => {
          if (!mountedRef.current) return
          if (subStatus === 'SUBSCRIBED') {
            setStatus('connected')
            backoffRef.current = BACKOFF_INITIAL_MS
          } else if (subStatus === 'TIMED_OUT' || subStatus === 'CHANNEL_ERROR') {
            setStatus('reconnecting')
            void supabase.removeChannel(channel)
            channelRef.current = null
            const delay = backoffRef.current
            backoffRef.current = Math.min(delay * 2, BACKOFF_CAP_MS)
            retryTimerRef.current = setTimeout(connect, delay)
          } else if (subStatus === 'CLOSED') {
            if (mountedRef.current) setStatus('disconnected')
          }
        })

      channelRef.current = channel
    }

    connect()

    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setStatus('disconnected')
    }
  }, [supabase, restaurantId])

  const subscribe = useCallback(
    (event: string, handler: RealtimeEventHandler): (() => void) => {
      const map = handlersRef.current
      if (!map.has(event)) map.set(event, new Set())
      map.get(event)!.add(handler)
      return () => {
        map.get(event)?.delete(handler)
      }
    },
    [],
  )

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, connected: status === 'connected', subscribe }),
    [status, subscribe],
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within <RealtimeProvider>')
  return ctx
}
