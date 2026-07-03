import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtime } from '../lib/realtime'

type BannerKind = 'info' | 'warning' | 'success'

interface Banner { id: number; message: string; kind: BannerKind }

const KIND: Record<BannerKind, { bg: string; border: string; icon: string; color: string }> = {
  info:    { bg: 'rgba(198,198,201,0.1)',  border: 'rgba(198,198,201,0.3)',  icon: 'info',     color: 'var(--md-primary)' },
  warning: { bg: 'rgba(255,183,120,0.1)',  border: 'rgba(255,183,120,0.3)',  icon: 'warning',  color: 'var(--md-tertiary)' },
  success: { bg: 'rgba(125,255,162,0.1)',  border: 'rgba(125,255,162,0.3)',  icon: 'check_circle', color: 'var(--md-secondary)' },
}

const AUTO_DISMISS_MS = 4_500
let nextId = 0

function Toast({ banner, onDismiss }: { banner: Banner; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(banner.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [banner.id, onDismiss])

  const { bg, border, icon, color } = KIND[banner.kind]

  return (
    <div
      className="kds-toast-in flex items-center gap-3 rounded-xl px-4 py-3 shadow-2xl"
      style={{ background: bg, border: `1px solid ${border}`, backdropFilter: 'blur(12px)' }}
    >
      <span className="material-symbols-outlined shrink-0" style={{ fontSize: 18, color }}>{icon}</span>
      <span className="text-sm font-medium flex-1" style={{ color: 'var(--md-on-surface)' }}>{banner.message}</span>
      <button
        onClick={() => onDismiss(banner.id)}
        aria-label="Dismiss"
        className="ml-1 shrink-0 transition-colors"
        style={{ color: 'var(--md-outline)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--md-on-surface)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--md-outline)')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
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
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2" style={{ width: 320 }}>
      {banners.map((b) => (
        <div key={b.id} className="pointer-events-auto">
          <Toast banner={b} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}
