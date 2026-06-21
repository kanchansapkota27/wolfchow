import { useCallback, useEffect, useRef, useState } from 'react'
import { useRealtime } from '../lib/realtime'

// ── Types ─────────────────────────────────────────────────────────────────────

type BannerKind = 'info' | 'warning' | 'success'

interface Banner {
  id: number
  message: string
  kind: BannerKind
}

const KIND_CLS: Record<BannerKind, string> = {
  info:    'bg-blue-800/90 border-blue-600/60 text-blue-100',
  warning: 'bg-amber-800/90 border-amber-600/60 text-amber-100',
  success: 'bg-green-800/90 border-green-600/60 text-green-100',
}

const AUTO_DISMISS_MS = 4_000

let nextId = 0

// ── Banner item ───────────────────────────────────────────────────────────────

function BannerItem({ banner, onDismiss }: { banner: Banner; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(banner.id), AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [banner.id, onDismiss])

  return (
    <div
      className={[
        'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm shadow-lg',
        KIND_CLS[banner.kind],
      ].join(' ')}
    >
      <span>{banner.message}</span>
      <button
        onClick={() => onDismiss(banner.id)}
        aria-label="Dismiss"
        className="shrink-0 text-xs opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

// ── Provider + host ───────────────────────────────────────────────────────────

export function EventBanners() {
  const { subscribe } = useRealtime()
  const [banners, setBanners] = useState<Banner[]>([])
  const addBanner = useRef<(msg: string, kind: BannerKind) => void>()

  addBanner.current = (message, kind) => {
    const id = nextId++
    setBanners((prev) => [...prev, { id, message, kind }])
  }

  const dismiss = useCallback((id: number) => {
    setBanners((prev) => prev.filter((b) => b.id !== id))
  }, [])

  // Pause state changes
  useEffect(() => {
    return subscribe('pause_state_changed', (_, payload) => {
      if (payload.paused) {
        const mode = payload.mode === 'timed' && payload.pause_until
          ? `for ${formatDuration(payload.pause_until as string)}`
          : 'manually'
        addBanner.current?.(`Orders paused ${mode}`, 'warning')
      } else {
        addBanner.current?.('Orders resumed — accepting new orders', 'success')
      }
    })
  }, [subscribe])

  // System / closure notices
  useEffect(() => {
    return subscribe('system_notice', (_, payload) => {
      const msg = (payload.message as string | undefined) ?? 'System notice'
      addBanner.current?.(msg, 'info')
    })
  }, [subscribe])

  useEffect(() => {
    return subscribe('closure_notice', (_, payload) => {
      const msg = (payload.message as string | undefined) ?? 'Restaurant closing soon'
      addBanner.current?.(msg, 'warning')
    })
  }, [subscribe])

  if (banners.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50 flex flex-col gap-2 p-3">
      {banners.map((b) => (
        <div key={b.id} className="pointer-events-auto">
          <BannerItem banner={b} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────────────

function formatDuration(pauseUntil: string): string {
  const ms = new Date(pauseUntil).getTime() - Date.now()
  if (ms <= 0) return 'a moment'
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
