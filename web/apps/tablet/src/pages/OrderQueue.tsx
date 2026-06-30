import { useCallback, useEffect, useState } from 'react'
import type { Order } from '@wolfchow/types'
import { useOrders } from '../lib/useOrders'
import { OrderSheet } from '../components/OrderSheet'

// ── Countdown display ─────────────────────────────────────────────────────────

function useCountdown(deadlineIso: string | null): string {
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!deadlineIso) return
    function update() {
      const ms = new Date(deadlineIso!).getTime() - Date.now()
      if (ms <= 0) { setLabel('Expiring…'); return }
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setLabel(`${mins}:${String(secs).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadlineIso])

  return label
}

// ── New order card ─────────────────────────────────────────────────────────────

const PAYMENT_BADGE: Record<string, string> = {
  card: '💳',
  pickup: '💵',
  delivery: '🛵',
}

function NewOrderCard({ order, onTap }: { order: Order; onTap: () => void }) {
  const countdown = useCountdown(order.accept_deadline_at)
  const itemsSummary = order.items
    ?.map((i) => `${i.quantity}× ${i.item_name ?? i.variant_name ?? '?'}`)
    .join(', ') ?? ''

  const isUrgent = order.accept_deadline_at
    ? new Date(order.accept_deadline_at).getTime() - Date.now() < 60_000
    : false

  return (
    <button
      onClick={onTap}
      className={[
        'w-full rounded-xl border-2 p-4 text-left transition-colors',
        isUrgent
          ? 'border-red-500 bg-red-900/20 animate-pulse'
          : 'border-amber-500/70 bg-amber-900/10 hover:bg-amber-900/20',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-100 truncate">{order.customer_name}</span>
            <span className="text-base leading-none">{PAYMENT_BADGE[order.payment_method]}</span>
          </div>
          {itemsSummary && (
            <p className="mt-0.5 text-xs text-gray-400 truncate">{itemsSummary}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">${Number(order.total).toFixed(2)}</p>
          {countdown && (
            <p className={['text-xs font-mono mt-0.5', isUrgent ? 'text-red-400' : 'text-amber-400'].join(' ')}>
              {countdown}
            </p>
          )}
        </div>
      </div>
      {order.scheduled_for && (
        <p className="mt-1.5 text-xs text-blue-400">
          Scheduled {new Date(order.scheduled_for).toLocaleTimeString()}
        </p>
      )}
    </button>
  )
}

// ── Active order card ─────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  accepted: 'bg-blue-900/40 border-blue-600/50 text-blue-300',
  preparing: 'bg-indigo-900/40 border-indigo-600/50 text-indigo-300',
  ready: 'bg-teal-900/40 border-teal-600/50 text-teal-300',
}

const STATUS_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
}

function ActiveOrderCard({ order }: { order: Order }) {
  const elapsed = Math.floor((Date.now() - new Date(order.updated_at).getTime()) / 60000)
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0

  return (
    <div className={['rounded-xl border px-3 py-2.5', STATUS_COLORS[order.status] ?? 'bg-gray-700/40 border-gray-600/50 text-gray-300'].join(' ')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate">{order.customer_name}</p>
          <p className="text-xs opacity-70">{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-semibold">{STATUS_LABELS[order.status] ?? order.status}</p>
          <p className="text-xs opacity-60">{elapsed}m ago</p>
        </div>
      </div>
    </div>
  )
}

// ── Main OrderQueue page ──────────────────────────────────────────────────────

export function OrderQueue() {
  const { newOrders, activeOrders, loading, accept, reject } = useOrders()
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  const handleAccept = useCallback(async () => {
    if (!selectedOrder) return
    await accept(selectedOrder.id)
    setSelectedOrder(null)
  }, [selectedOrder, accept])

  const handleReject = useCallback(async (reason?: string) => {
    if (!selectedOrder) return
    await reject(selectedOrder.id, reason)
    setSelectedOrder(null)
  }, [selectedOrder, reject])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400 text-sm">
        Loading orders…
      </div>
    )
  }

  return (
    <div className="flex h-full gap-0">
      {/* Left: new incoming orders */}
      <div className="flex w-1/2 flex-col border-r border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-200">
            Incoming
            {newOrders.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs text-gray-900 font-bold">
                {newOrders.length}
              </span>
            )}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {newOrders.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-gray-500">
              No incoming orders
            </div>
          ) : (
            newOrders.map((order) => (
              <NewOrderCard
                key={order.id}
                order={order}
                onTap={() => setSelectedOrder(order)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: active orders */}
      <div className="flex w-1/2 flex-col">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-200">
            In Kitchen
            {activeOrders.length > 0 && (
              <span className="ml-2 rounded-full bg-gray-600 px-2 py-0.5 text-xs text-gray-300 font-bold">
                {activeOrders.length}
              </span>
            )}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeOrders.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-gray-500">
              No active orders
            </div>
          ) : (
            activeOrders.map((order) => (
              <ActiveOrderCard key={order.id} order={order} />
            ))
          )}
        </div>
      </div>

      {/* Bottom sheet */}
      {selectedOrder && (
        <OrderSheet
          order={selectedOrder}
          onAccept={handleAccept}
          onReject={handleReject}
          onClose={() => setSelectedOrder(null)}
        />
      )}
    </div>
  )
}
