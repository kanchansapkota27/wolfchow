import { useCallback, useEffect, useState } from 'react'
import type { PauseState } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

function usePauseCountdown(pauseUntil: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!pauseUntil) { setLabel(null); return }
    function update() {
      const ms = new Date(pauseUntil!).getTime() - Date.now()
      if (ms <= 0) { setLabel('Resuming…'); return }
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      const s = Math.floor((ms % 60_000) / 1_000)
      setLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [pauseUntil])
  return label
}

// ── Pause options ─────────────────────────────────────────────────────────────

const PAUSE_OPTIONS: Array<{ label: string; sub: string; mode: 'timed' | 'manual'; minutes?: number; icon: string }> = [
  { label: '15 min', sub: 'Back in 15 minutes', mode: 'timed',  minutes: 15, icon: 'timer' },
  { label: '30 min', sub: 'Back in 30 minutes', mode: 'timed',  minutes: 30, icon: 'timer' },
  { label: '1 hour', sub: 'Back in an hour',    mode: 'timed',  minutes: 60, icon: 'schedule' },
  { label: 'Manual', sub: 'Until you resume',   mode: 'manual',              icon: 'pan_tool' },
]

// ── Paused fullscreen state ───────────────────────────────────────────────────

function PausedView({ pause, onResume, resuming }: { pause: PauseState; onResume: () => void; resuming: boolean }) {
  const countdown = usePauseCountdown(pause.pause_until)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center" style={{ background: 'rgba(255,183,120,0.03)' }}>
      <div
        className="flex h-32 w-32 items-center justify-center rounded-full"
        style={{ background: 'rgba(255,183,120,0.1)', border: '3px solid rgba(255,183,120,0.3)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: 'var(--md-tertiary)', fontVariationSettings: "'FILL' 1" }}>pause_circle</span>
      </div>

      <div className="space-y-3">
        <p
          className="font-black"
          style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 32, color: 'var(--md-tertiary)' }}
        >
          Orders Paused
        </p>
        {pause.pause_mode === 'timed' && countdown && (
          <p
            className="tabular-nums font-black"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 48, color: 'var(--md-on-surface)' }}
          >
            {countdown}
          </p>
        )}
        {pause.pause_mode === 'manual' && (
          <p className="text-sm font-medium" style={{ color: 'var(--md-outline)' }}>Until manually resumed</p>
        )}
        {pause.pause_reason && (
          <p className="text-sm italic" style={{ color: 'var(--md-on-surface-var)' }}>"{pause.pause_reason}"</p>
        )}
      </div>

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={resuming}
          className="rounded-xl font-black transition-all active:scale-95 disabled:opacity-40"
          style={{
            padding: '16px 48px',
            background: 'var(--md-secondary-c)',
            color: 'var(--md-on-secondary-c)',
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 14,
            letterSpacing: '0.05em',
          }}
        >
          RESUME ORDERS
        </button>
      ) : (
        <div className="space-y-4 w-full max-w-xs">
          <p className="text-base font-semibold" style={{ color: 'var(--md-on-surface)' }}>Resume accepting orders now?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl py-4 text-sm font-bold transition-colors"
              style={{ border: '1px solid var(--md-outline-var)', color: 'var(--md-on-surface-var)', background: 'var(--md-surface-c)', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em', fontSize: 12 }}
            >
              CANCEL
            </button>
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex-1 rounded-xl py-4 font-black transition-all active:scale-95 disabled:opacity-40"
              style={{ background: 'var(--md-secondary-c)', color: 'var(--md-on-secondary-c)', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.04em', fontSize: 12 }}
            >
              {resuming ? 'RESUMING…' : 'YES, RESUME'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PauseControl() {
  const api = useApi()
  const { subscribe } = useRealtime()
  const [pause, setPause] = useState<PauseState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.orders.tabletSession().then(({ pause_state }) => {
      setPause(pause_state ?? { orders_paused: false, pause_mode: null, pause_until: null, pause_reason: null, pause_scheduled_orders: false })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [api])

  useEffect(() => {
    return subscribe('pause_state_changed', (_, payload) => {
      setPause((prev) => ({
        orders_paused: payload.paused as boolean,
        pause_mode: (payload.mode as 'timed' | 'manual' | 'rest_of_day' | null) ?? null,
        pause_until: (payload.pause_until as string | null) ?? null,
        pause_reason: (payload.reason as string | null) ?? null,
        pause_scheduled_orders: prev?.pause_scheduled_orders ?? false,
      }))
    })
  }, [subscribe])

  const handlePause = useCallback(async (mode: 'timed' | 'manual', minutes?: number) => {
    setBusy(true)
    try { setPause(await api.orders.tabletPauseOrders({ mode, duration_minutes: minutes })) }
    finally { setBusy(false) }
  }, [api])

  const handleResume = useCallback(async () => {
    setBusy(true)
    try { setPause(await api.orders.tabletUnpauseOrders()) }
    finally { setBusy(false) }
  }, [api])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--md-bg)' }}>
        <div
          className="h-10 w-10 animate-spin rounded-full border-4"
          style={{ borderColor: 'var(--md-surface-ch)', borderTopColor: 'var(--md-tertiary)' }}
        />
      </div>
    )
  }

  if (pause?.orders_paused) {
    return <PausedView pause={pause} onResume={() => void handleResume()} resuming={busy} />
  }

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--md-bg)' }}>
      <div className="border-b px-6 py-4" style={{ borderColor: 'var(--md-outline-var)' }}>
        <p
          className="font-bold"
          style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 20, color: 'var(--md-on-surface)' }}
        >
          Pause Orders
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-2.5 h-2.5 rounded-full pulse-dot" style={{ background: 'var(--md-secondary)' }} />
          <p
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--md-secondary)', letterSpacing: '0.05em' }}
          >
            CURRENTLY ACCEPTING ORDERS
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
        <div className="text-center">
          <p className="font-bold" style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 22, color: 'var(--md-on-surface)' }}>
            How long do you need?
          </p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--md-outline)' }}>
            New orders will be paused for this duration
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
          {PAUSE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => void handlePause(opt.mode, opt.minutes)}
              disabled={busy}
              className="flex flex-col items-center justify-center rounded-2xl py-8 px-4 text-center transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: 'rgba(255,183,120,0.06)',
                border: '2px solid rgba(255,183,120,0.2)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.border = '2px solid rgba(255,183,120,0.5)')}
              onMouseLeave={(e) => (e.currentTarget.style.border = '2px solid rgba(255,183,120,0.2)')}
            >
              <span className="material-symbols-outlined mb-3" style={{ fontSize: 32, color: 'var(--md-tertiary)', fontVariationSettings: "'FILL' 1" }}>
                {opt.icon}
              </span>
              <p
                className="font-black"
                style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 22, color: 'var(--md-tertiary)' }}
              >
                {opt.label}
              </p>
              <p className="text-xs mt-1.5" style={{ color: 'var(--md-on-tertiary-c)' }}>{opt.sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
