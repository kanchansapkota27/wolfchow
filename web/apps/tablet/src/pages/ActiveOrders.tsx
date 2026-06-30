import { useState, useCallback } from 'react'
import type { Order, OrderStatus } from '@wolfchow/types'
import { useOrders } from '../lib/useOrders'

// ── Status config ─────────────────────────────────────────────────────────────

const NEXT_STATUS: Partial<Record<OrderStatus, string>> = {
  accepted: 'preparing',
  preparing: 'ready',
  ready: 'completed',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: 'Start Preparing',
  preparing: 'Mark Ready',
  ready: 'Complete ✓',
}

const CARD_STYLE: Record<string, string> = {
  accepted: 'border-blue-600/60 bg-blue-900/20',
  preparing: 'border-amber-500/60 bg-amber-900/20',
  ready: 'border-teal-500/60 bg-teal-900/20',
}

const STATUS_BADGE: Record<string, string> = {
  accepted: 'bg-blue-800/60 text-blue-200',
  preparing: 'bg-amber-800/60 text-amber-200',
  ready: 'bg-teal-800/60 text-teal-200',
}

function elapsed(isoDate: string): string {
  const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ── Active order card ─────────────────────────────────────────────────────────

interface CardProps {
  order: Order
  completing: boolean
  onAdvance: (orderId: string, nextStatus: string) => void
}

function ActiveOrderCard({ order, completing, onAdvance }: CardProps) {
  const [busy, setBusy] = useState(false)
  const nextStatus = NEXT_STATUS[order.status]
  const nextLabel = NEXT_LABEL[order.status]
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0

  async function handleAdvance() {
    if (!nextStatus) return
    setBusy(true)
    try { onAdvance(order.id, nextStatus) } finally { setBusy(false) }
  }

  return (
    <div
      className={[
        'rounded-xl border-2 p-4 space-y-3 transition-all duration-500',
        CARD_STYLE[order.status] ?? 'border-gray-600/50 bg-gray-800/40',
        completing ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-semibold text-gray-100">{order.customer_name}</p>
            <span className={['rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE[order.status] ?? 'bg-gray-700 text-gray-300'].join(' ')}>
              {order.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {itemCount} item{itemCount !== 1 ? 's' : ''} · {elapsed(order.updated_at)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">${Number(order.total).toFixed(2)}</p>
          <p className="text-xs text-gray-500">{order.payment_method}</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {order.items?.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="shrink-0 rounded bg-gray-700/70 px-1.5 py-0.5 text-xs font-bold text-gray-200">
              {item.quantity}×
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-100 leading-tight">
                {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
              </p>
              {item.modifiers.map((m, j) => (
                <p key={j} className="text-xs text-gray-500">+ {m.name}</p>
              ))}
              {item.notes && (
                <p className="text-xs italic text-amber-400">{item.notes}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <p className="text-xs italic text-amber-400 border-t border-gray-600/40 pt-2">
          Note: {order.notes}
        </p>
      )}

      {/* Advance button */}
      {nextLabel && nextStatus && (
        <button
          onClick={() => void handleAdvance()}
          disabled={busy}
          className={[
            'w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-40',
            order.status === 'ready'
              ? 'bg-teal-600 text-white hover:bg-teal-500'
              : order.status === 'preparing'
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : 'bg-blue-700 text-white hover:bg-blue-600',
          ].join(' ')}
        >
          {busy ? 'Updating…' : nextLabel}
        </button>
      )}
    </div>
  )
}

// ── Main ActiveOrders page ─────────────────────────────────────────────────────

export function ActiveOrders() {
  const { activeOrders, loading, updateStatus } = useOrders()
  const [completing, setCompleting] = useState<Set<string>>(new Set())

  const handleAdvance = useCallback(async (orderId: string, nextStatus: string) => {
    if (nextStatus === 'completed') {
      setCompleting((prev) => new Set([...prev, orderId]))
      setTimeout(async () => {
        await updateStatus(orderId, 'completed').catch(() => {})
      }, 500)
    } else {
      await updateStatus(orderId, nextStatus)
    }
  }, [updateStatus])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  const visible = activeOrders.filter((o) => o.status !== 'completed' || completing.has(o.id))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-200">
          Active Orders
          {visible.length > 0 && (
            <span className="ml-2 rounded-full bg-gray-600 px-2 py-0.5 text-xs text-gray-300 font-bold">
              {visible.length}
            </span>
          )}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visible.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500">
            No active orders
          </div>
        ) : (
          visible.map((order) => (
            <ActiveOrderCard
              key={order.id}
              order={order}
              completing={completing.has(order.id)}
              onAdvance={(id, next) => void handleAdvance(id, next)}
            />
          ))
        )}
      </div>
    </div>
  )
}
