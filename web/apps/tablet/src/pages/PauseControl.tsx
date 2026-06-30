import { useCallback, useEffect, useState } from 'react'
import type { PauseState } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

// ── Countdown display ─────────────────────────────────────────────────────────

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

// ── Pause touch cards ─────────────────────────────────────────────────────────

const PAUSE_OPTIONS: Array<{ label: string; sub: string; mode: 'timed' | 'manual'; minutes?: number }> = [
  { label: '15 min',  sub: 'Back in 15 minutes',  mode: 'timed', minutes: 15 },
  { label: '30 min',  sub: 'Back in 30 minutes',  mode: 'timed', minutes: 30 },
  { label: '1 hour',  sub: 'Back in 1 hour',       mode: 'timed', minutes: 60 },
  { label: 'Manual',  sub: 'Until you resume',      mode: 'manual' },
]

interface TouchCardProps {
  label: string
  sub: string
  busy: boolean
  onClick: () => void
}

function TouchCard({ label, sub, busy, onClick }: TouchCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex flex-col items-center justify-center rounded-2xl border-2 border-amber-500/40 bg-amber-900/20 p-6 text-center transition-colors hover:bg-amber-900/40 disabled:opacity-40 active:scale-95"
    >
      <p className="text-2xl font-bold text-amber-300">{label}</p>
      <p className="mt-1 text-xs text-amber-400/80">{sub}</p>
    </button>
  )
}

// ── Paused indicator ──────────────────────────────────────────────────────────

interface PausedViewProps {
  pause: PauseState
  onResume: () => void
  resuming: boolean
}

function PausedView({ pause, onResume, resuming }: PausedViewProps) {
  const countdown = usePauseCountdown(pause.pause_until)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      {/* Status indicator */}
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-amber-500/20 border-4 border-amber-500/60">
        <span className="text-4xl">⏸</span>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-amber-300">Orders Paused</h2>
        {pause.pause_mode === 'timed' && countdown && (
          <p className="text-4xl font-mono font-semibold text-white">{countdown}</p>
        )}
        {pause.pause_mode === 'manual' && (
          <p className="text-sm text-amber-400/80">Paused until manually resumed</p>
        )}
        {pause.pause_reason && (
          <p className="text-sm text-gray-400 italic">"{pause.pause_reason}"</p>
        )}
      </div>

      {/* Resume button / confirmation */}
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={resuming}
          className="mt-4 rounded-2xl bg-green-700 px-10 py-4 text-lg font-semibold text-white hover:bg-green-600 disabled:opacity-40 transition-colors"
        >
          Resume Orders
        </button>
      ) : (
        <div className="mt-4 space-y-3 w-full max-w-xs">
          <p className="text-sm text-gray-300">Resume accepting orders now?</p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-gray-600 py-3 text-sm text-gray-400 hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={onResume}
              disabled={resuming}
              className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-40"
            >
              {resuming ? 'Resuming…' : 'Yes, Resume'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main PauseControl page ────────────────────────────────────────────────────

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
    try {
      const state = await api.orders.tabletPauseOrders({ mode, duration_minutes: minutes })
      setPause(state)
    } finally {
      setBusy(false)
    }
  }, [api])

  const handleResume = useCallback(async () => {
    setBusy(true)
    try {
      const state = await api.orders.tabletUnpauseOrders()
      setPause(state)
    } finally {
      setBusy(false)
    }
  }, [api])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  // Paused state — full-screen indicator
  if (pause?.orders_paused) {
    return <PausedView pause={pause} onResume={() => void handleResume()} resuming={busy} />
  }

  // Not paused — show 4 touch cards
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">Pause Orders</h2>
        <p className="mt-0.5 text-xs text-gray-500">Currently accepting orders</p>
      </div>

      <div className="flex-1 p-4">
        <p className="mb-4 text-center text-xs text-gray-400">How long do you want to pause?</p>
        <div className="grid grid-cols-2 gap-3">
          {PAUSE_OPTIONS.map((opt) => (
            <TouchCard
              key={opt.label}
              label={opt.label}
              sub={opt.sub}
              busy={busy}
              onClick={() => void handlePause(opt.mode, opt.minutes)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
