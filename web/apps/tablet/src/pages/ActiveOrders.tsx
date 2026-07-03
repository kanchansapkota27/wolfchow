import { useCallback, useEffect, useState } from 'react'
import type { Order, OrderStatus } from '@wolfchow/types'
import { useOrders } from '../lib/useOrders'

function shortId(order: Order): string {
  return order.id.slice(-4).toUpperCase()
}

function useElapsed(isoDate: string): { label: string; mins: number } {
  const [state, setState] = useState({ label: '', mins: 0 })
  useEffect(() => {
    function update() {
      const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000)
      setState({
        mins,
        label: mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`,
      })
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [isoDate])
  return state
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string; actionLabel: string; nextStatus: string
  cardBg: string; cardBorder: string
  badgeBg: string; badgeColor: string
  btnBg: string
}> = {
  accepted: {
    label: 'Accepted', actionLabel: 'Start Preparing →', nextStatus: 'preparing',
    cardBg: 'rgba(59,130,246,0.07)', cardBorder: '#3b82f630',
    badgeBg: 'rgba(59,130,246,0.2)', badgeColor: '#60a5fa',
    btnBg: '#1d4ed8',
  },
  preparing: {
    label: 'Preparing', actionLabel: 'Mark Ready →', nextStatus: 'ready',
    cardBg: 'rgba(99,102,241,0.07)', cardBorder: '#6366f130',
    badgeBg: 'rgba(99,102,241,0.2)', badgeColor: '#818cf8',
    btnBg: '#4338ca',
  },
  ready: {
    label: 'Ready ✓', actionLabel: 'Complete ✓', nextStatus: 'completed',
    cardBg: 'rgba(16,185,129,0.07)', cardBorder: '#10b98130',
    badgeBg: 'rgba(16,185,129,0.2)', badgeColor: '#34d399',
    btnBg: '#059669',
  },
}

// ── Full Detail Card ──────────────────────────────────────────────────────────

interface DetailCardProps {
  order: Order
  completing: boolean
  onAdvance: (orderId: string, nextStatus: string) => void
}

function DetailCard({ order, completing, onAdvance }: DetailCardProps) {
  const [busy, setBusy] = useState(false)
  const { label: elapsed, mins } = useElapsed(order.updated_at)
  const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.accepted
  const nextStatus = cfg.nextStatus
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0
  const isReady = order.status === 'ready'
  const overdue = isReady && mins >= 10

  async function handleAdvance() {
    setBusy(true)
    try { onAdvance(order.id, nextStatus) } finally { setBusy(false) }
  }

  return (
    <div
      className={[
        'rounded-2xl border-2 flex flex-col transition-all duration-400',
        completing ? 'opacity-0 -translate-x-8 scale-95' : 'kds-card-in',
      ].join(' ')}
      style={{
        background: overdue ? 'rgba(239,68,68,0.07)' : cfg.cardBg,
        borderColor: overdue ? '#ef444450' : cfg.cardBorder,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-white">#{shortId(order)}</span>
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold"
            style={{ background: overdue ? 'rgba(239,68,68,0.2)' : cfg.badgeBg, color: overdue ? '#f87171' : cfg.badgeColor }}
          >
            {overdue ? '⚠️ Waiting' : cfg.label}
          </span>
        </div>
        <span className="text-sm font-medium" style={{ color: overdue ? '#f87171' : '#64748b' }}>
          ⏱ {elapsed}
        </span>
      </div>

      {/* Customer + total */}
      <div className="flex items-center justify-between px-4 pb-3">
        <p className="text-base font-bold text-white">{order.customer_name}</p>
        <p className="text-sm font-bold text-white">${Number(order.total).toFixed(2)}</p>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t" style={{ borderColor: '#1e293b' }} />

      {/* Items — full detail */}
      <div className="px-4 py-3 space-y-2.5">
        {order.items?.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-sm font-black text-white"
              style={{ background: '#1e293b' }}
            >
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white leading-snug">
                {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
              </p>
              {item.modifiers.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {item.modifiers.map((m, j) => (
                    <p key={j} className="text-xs" style={{ color: '#64748b' }}>↳ {m.name}</p>
                  ))}
                </div>
              )}
              {item.notes && (
                <p className="mt-0.5 text-xs italic font-medium" style={{ color: '#fbbf24' }}>📝 {item.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Order notes */}
      {order.notes && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-sm italic" style={{ background: 'rgba(251,191,36,0.1)', color: '#fde68a' }}>
          📝 {order.notes}
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 border-t" style={{ borderColor: '#1e293b' }} />

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs" style={{ color: '#64748b' }}>
          {itemCount} item{itemCount !== 1 ? 's' : ''} · {order.payment_method}
        </span>
        <button
          onClick={() => void handleAdvance()}
          disabled={busy || completing}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-40"
          style={{ background: cfg.btnBg }}
        >
          {busy ? '…' : cfg.actionLabel}
        </button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES: OrderStatus[] = ['accepted', 'preparing', 'ready']

export function ActiveOrders() {
  const { activeOrders, loading, updateStatus } = useOrders()
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const visible = activeOrders.filter((o) =>
    ACTIVE_STATUSES.includes(o.status) && !completing.has(o.id),
  )

  const handleAdvance = useCallback((orderId: string, nextStatus: string) => {
    if (nextStatus === 'completed') {
      setCompleting((prev) => new Set([...prev, orderId]))
      setTimeout(() => {
        void updateStatus(orderId, 'completed').catch(() => {})
        setCompleting((prev) => { const next = new Set(prev); next.delete(orderId); return next })
      }, 400)
    } else {
      void updateStatus(orderId, nextStatus)
    }
  }, [updateStatus])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: '#1e293b', borderTopColor: '#3b82f6' }} />
        <p className="text-sm" style={{ color: '#64748b' }}>Loading kitchen…</p>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <span className="text-6xl opacity-20">🍳</span>
        <p className="text-base font-semibold" style={{ color: '#475569' }}>Kitchen is clear</p>
        <p className="text-sm" style={{ color: '#334155' }}>No orders in progress</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ background: '#080d17' }}>
      {/* Header row */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: '#1e293b' }}>
        <h2 className="text-sm font-bold tracking-wide uppercase text-white">Kitchen View</h2>
        <div className="flex items-center gap-3 text-xs" style={{ color: '#64748b' }}>
          {(['accepted', 'preparing', 'ready'] as OrderStatus[]).map((s) => {
            const n = visible.filter((o) => o.status === s).length
            const cfg = STATUS_CFG[s]
            return n > 0 ? (
              <span key={s} className="rounded-full px-2.5 py-1 font-semibold" style={{ background: cfg.badgeBg, color: cfg.badgeColor }}>
                {n} {cfg.label}
              </span>
            ) : null
          })}
        </div>
      </div>

      {/* Cards — 2-column responsive grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {visible.map((order) => (
            <DetailCard
              key={order.id}
              order={order}
              completing={completing.has(order.id)}
              onAdvance={handleAdvance}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
