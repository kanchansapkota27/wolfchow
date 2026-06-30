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
  { label: '15 min',  sub: 'Back in 15 minutes',    mode: 'timed',  minutes: 15,  icon: '⏱' },
  { label: '30 min',  sub: 'Back in 30 minutes',    mode: 'timed',  minutes: 30,  icon: '⏱' },
  { label: '1 hour',  sub: 'Back in an hour',        mode: 'timed',  minutes: 60,  icon: '🕐' },
  { label: 'Manual',  sub: 'Until you resume',        mode: 'manual',               icon: '✋' },
]

// ── Paused fullscreen state ───────────────────────────────────────────────────

function PausedView({ pause, onResume, resuming }: { pause: PauseState; onResume: () => void; resuming: boolean }) {
  const countdown = usePauseCountdown(pause.pause_until)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8 text-center" style={{ background: 'rgba(120,53,15,0.08)' }}>
      {/* Big pause indicator */}
      <div
        className="flex h-32 w-32 items-center justify-center rounded-full text-6xl"
        style={{ background: 'rgba(245,158,11,0.15)', border: '3px solid rgba(245,158,11,0.4)' }}
      >
        ⏸
      </div>

      <div className="space-y-3">
        <p className="text-3xl font-black" style={{ color: '#fbbf24' }}>Orders Paused</p>
        {pause.pause_mode === 'timed' && countdown && (
          <p className="text-5xl font-black tabular-nums text-white">{countdown}</p>
        )}
        {pause.pause_mode === 'manual' && (
          <p className="text-sm font-medium" style={{ color: '#92400e' }}>Until manually resumed</p>
        )}
        {pause.pause_reason && (
          <p className="text-sm italic" style={{ color: '#78716c' }}>"{pause.pause_reason}"</p>
        )}
      </div>

      {/* Resume */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={resuming}
          className="rounded-2xl px-12 py-5 text-xl font-black text-white transition-colors disabled:opacity-40"
          style={{ background: '#16a34a' }}
        >
          ▶ Resume Orders
        </button>
      ) : (
        <div className="space-y-4 w-full max-w-xs">
          <p className="text-base font-semibold text-white">Resume accepting orders now?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-2xl border py-4 text-sm font-bold transition-colors"
              style={{ borderColor: '#334155', color: '#94a3b8', background: '#1e293b' }}
            >
              Cancel
            </button>
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex-1 rounded-2xl py-4 text-sm font-black text-white transition-colors disabled:opacity-40"
              style={{ background: '#16a34a' }}
            >
              {resuming ? 'Resuming…' : '✓ Yes, Resume'}
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
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: '#1e293b', borderTopColor: '#f59e0b' }} />
      </div>
    )
  }

  if (pause?.orders_paused) {
    return <PausedView pause={pause} onResume={() => void handleResume()} resuming={busy} />
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#080d17' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: '#1e293b' }}>
        <p className="text-sm font-bold text-white">Pause Orders</p>
        <p className="text-xs mt-0.5" style={{ color: '#10b981' }}>● Currently accepting orders</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center mb-2">
          <p className="text-lg font-bold text-white">How long do you need?</p>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>New orders will be paused for this duration</p>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
          {PAUSE_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => void handlePause(opt.mode, opt.minutes)}
              disabled={busy}
              className="flex flex-col items-center justify-center rounded-3xl py-8 px-4 text-center transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: 'rgba(245,158,11,0.08)',
                border: '2px solid rgba(245,158,11,0.25)',
              }}
            >
              <span className="text-3xl mb-2">{opt.icon}</span>
              <p className="text-2xl font-black" style={{ color: '#fbbf24' }}>{opt.label}</p>
              <p className="text-xs mt-1" style={{ color: '#92400e' }}>{opt.sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
