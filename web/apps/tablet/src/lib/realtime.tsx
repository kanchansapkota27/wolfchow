import { createClient, type RealtimeChannel } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@wolfchow/auth'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export type RealtimeEventHandler = (event: string, payload: Record<string, unknown>) => void

export interface RealtimeContextValue {
  connected: boolean
  /** Subscribe to one or all broadcast events on the restaurant channel. */
  subscribe(event: string, handler: RealtimeEventHandler): () => void
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null)

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { restaurantId } = useAuth()
  const [connected, setConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const handlersRef = useRef<Map<string, Set<RealtimeEventHandler>>>(new Map())

  const supabase = useMemo(
    () => (SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null),
    [],
  )

  useEffect(() => {
    if (!supabase || !restaurantId) return

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
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel
    return () => {
      setConnected(false)
      void supabase.removeChannel(channel)
      channelRef.current = null
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
    () => ({ connected, subscribe }),
    [connected, subscribe],
  )

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used within <RealtimeProvider>')
  return ctx
}
