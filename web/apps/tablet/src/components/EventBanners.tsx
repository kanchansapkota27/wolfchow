import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtime } from '../lib/realtime'

type BannerKind = 'info' | 'warning' | 'success'

interface Banner { id: number; message: string; kind: BannerKind }

const KIND: Record<BannerKind, { bg: string; border: string; icon: string }> = {
  info:    { bg: 'rgba(59,130,246,0.15)',  border: 'rgba(59,130,246,0.4)',  icon: 'ℹ️' },
  warning: { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', icon: '⚠️' },
  success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', icon: '✅' },
}

const AUTO_DISMISS_MS = 4_500
let nextId = 0

function Toast({ banner, onDismiss }: { banner: Banner; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(banner.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [banner.id, onDismiss])

  const { bg, border, icon } = KIND[banner.kind]

  return (
    <div
      className="kds-toast-in flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
      style={{ background: bg, border: `1px solid ${border}`, backdropFilter: 'blur(12px)' }}
    >
      <span className="text-lg leading-none shrink-0">{icon}</span>
      <span className="text-sm font-medium text-white">{banner.message}</span>
      <button
        onClick={() => onDismiss(banner.id)}
        aria-label="Dismiss"
        className="ml-2 shrink-0 text-slate-400 hover:text-white transition-colors"
      >
        ✕
      </button>
    </div>
  )
}

function formatDuration(pauseUntil: string): string {
  const ms = new Date(pauseUntil).getTime() - Date.now()
  if (ms <= 0) return 'a moment'
  const m = Math.ceil(ms / 60_000)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export function EventBanners() {
  const { subscribe } = useRealtime()
  const [banners, setBanners] = useState<Banner[]>([])
  const addBanner = useRef<((msg: string, kind: BannerKind) => void) | undefined>(undefined)

  addBanner.current = (message, kind) => {
    const id = nextId++
    setBanners((prev) => [...prev.slice(-3), { id, message, kind }])
  }

  const dismiss = useCallback((id: number) => {
    setBanners((prev) => prev.filter((b) => b.id !== id))
  }, [])

  useEffect(() => {
    return subscribe('pause_state_changed', (_, payload) => {
      if (payload.paused) {
        const suffix = payload.mode === 'timed' && payload.pause_until
          ? ` for ${formatDuration(payload.pause_until as string)}`
          : ' manually'
        addBanner.current?.(`Orders paused${suffix}`, 'warning')
      } else {
        addBanner.current?.('Orders resumed — accepting new orders', 'success')
      }
    })
  }, [subscribe])

  useEffect(() => {
    return subscribe('system_notice', (_, payload) => {
      addBanner.current?.((payload.message as string | undefined) ?? 'System notice', 'info')
    })
  }, [subscribe])

  useEffect(() => {
    return subscribe('closure_notice', (_, payload) => {
      addBanner.current?.((payload.message as string | undefined) ?? 'Restaurant closing soon', 'warning')
    })
  }, [subscribe])

  if (banners.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-50 flex flex-col gap-2" style={{ width: 320 }}>
      {banners.map((b) => (
        <div key={b.id} className="pointer-events-auto">
          <Toast banner={b} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
