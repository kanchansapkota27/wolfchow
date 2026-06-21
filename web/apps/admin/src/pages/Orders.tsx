import { useState, useEffect, useCallback } from 'react'
import { Button } from '@wolfchow/ui'
import { useAuth } from '@wolfchow/auth'
import { useApi } from '../lib/api'
import { subscribeToOrders } from '../lib/realtime'
import type { Order } from '@wolfchow/types'
import type { PauseState, PauseMode } from '@wolfchow/api-client'

const STATUS_COLORS: Record<string, string> = {
  auth_success: 'bg-amber-100 text-amber-700',
  accepted:     'bg-blue-100 text-blue-700',
  preparing:    'bg-indigo-100 text-indigo-700',
  ready:        'bg-teal-100 text-teal-700',
  completed:    'bg-green-100 text-green-700',
  rejected:     'bg-red-100 text-red-700',
  missed:       'bg-orange-100 text-orange-700',
  refunded:     'bg-purple-100 text-purple-700',
}

const PAYMENT_LABELS: Record<string, string> = {
  card:     'Card',
  pickup:   'Cash',
  delivery: 'Delivery',
}

function elapsedLabel(isoDate: string): string {
  const secs = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

function countdownLabel(until: string | null): string {
  if (!until) return ''
  const ms = new Date(until).getTime() - Date.now()
  if (ms <= 0) return 'expired'
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s remaining`
}

// ── Pause Panel ───────────────────────────────────────────────────────────────

const TIMED_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: '15 min', minutes: 15 },
  { label: '25 min', minutes: 25 },
  { label: '35 min', minutes: 35 },
]

interface PausePanelProps {
  pause: PauseState
  onPause: (mode: PauseMode, minutes?: number) => Promise<void>
  onUnpause: () => Promise<void>
}

function PausePanel({ pause, onPause, onUnpause }: PausePanelProps) {
  const [selecting, setSelecting] = useState(false)
  const [loading, setLoading] = useState(false)

  if (pause.orders_paused) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-amber-800">
            Orders paused{pause.pause_mode === 'timed' && pause.pause_until ? ` — ${countdownLabel(pause.pause_until)}` : ''}
          </p>
          {pause.pause_reason && <p className="text-xs text-amber-600">{pause.pause_reason}</p>}
        </div>
        <button
          onClick={async () => { setLoading(true); await onUnpause(); setLoading(false) }}
          disabled={loading}
          className="text-sm text-amber-700 border border-amber-300 rounded-md px-3 py-1 hover:bg-amber-100 disabled:opacity-40"
          aria-label="Unpause orders"
        >
          Unpause
        </button>
      </div>
    )
  }

  if (selecting) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Pause for how long?</p>
        <div className="flex flex-wrap gap-2">
          {TIMED_OPTIONS.map(({ label, minutes }) => (
            <button
              key={minutes}
              onClick={async () => { setLoading(true); setSelecting(false); await onPause('timed', minutes); setLoading(false) }}
              disabled={loading}
              className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
            >
              {label}
            </button>
          ))}
          <button
            onClick={async () => { setLoading(true); setSelecting(false); await onPause('manual'); setLoading(false) }}
            disabled={loading}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
          >
            Manual
          </button>
          <button
            onClick={async () => { setLoading(true); setSelecting(false); await onPause('rest_of_day'); setLoading(false) }}
            disabled={loading}
            className="text-sm border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40"
          >
            Rest of day
          </button>
          <button onClick={() => setSelecting(false)} className="text-sm text-gray-500 px-2">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <Button variant="ghost" onClick={() => setSelecting(true)}>Pause orders</Button>
    </div>
  )
}

// ── Order card ────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order
  onAccept: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
}

function OrderCard({ order, onAccept, onReject }: OrderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const itemsSummary = order.items?.map((i) => `${i.quantity}× ${(i as unknown as { name?: string }).name ?? i.item_id}`).join(', ') ?? '—'

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{order.customer_name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>{order.status}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600`}>{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</span>
            {order.scheduled_for && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">Scheduled {new Date(order.scheduled_for).toLocaleString()}</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{itemsSummary}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-gray-900">${order.total.toFixed(2)}</p>
          {order.tip_amount > 0 && <p className="text-xs text-gray-500">tip ${order.tip_amount.toFixed(2)}</p>}
          <p className="text-xs text-gray-400 mt-1">{elapsedLabel(order.created_at)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} order ${order.id.slice(0, 8)}`}
        >
          {expanded ? 'Collapse ▲' : 'Details ▼'}
        </button>
        {order.status === 'auth_success' && (
          <>
            <Button onClick={async () => { setAccepting(true); await onAccept(order.id); setAccepting(false) }} loading={accepting}>Accept</Button>
            <Button variant="ghost" onClick={async () => { setRejecting(true); await onReject(order.id); setRejecting(false) }} loading={rejecting}>Reject</Button>
          </>
        )}
      </div>
      {expanded && (
        <div className="border-t border-gray-50 pt-3 space-y-2">
          <div className="text-xs text-gray-500 space-y-1">
            <p>{order.customer_email}{order.customer_phone ? ` · ${order.customer_phone}` : ''}</p>
            {order.notes && <p className="italic">Note: {order.notes}</p>}
          </div>
          <div className="space-y-1">
            {order.items?.map((item, i) => {
              const name = (item as unknown as { name?: string }).name ?? item.item_id
              return (
                <div key={i} className="text-sm">
                  <span className="font-medium">{item.quantity}× {name}</span>
                  <span className="text-gray-500"> ${(item.unit_price * item.quantity / 100).toFixed(2)}</span>
                  {item.modifiers.length > 0 && (
                    <div className="pl-4 text-xs text-gray-500 space-y-0.5">
                      {item.modifiers.map((m, j) => (
                        <div key={j}>+ {m.name}{m.price_delta !== 0 ? ` ($${(m.price_delta / 100).toFixed(2)})` : ''}</div>
                      ))}
                    </div>
                  )}
                  {item.notes && <div className="pl-4 text-xs text-gray-400 italic">{item.notes}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Orders page ──────────────────────────────────────────────────────────

export function Orders() {
  const api = useApi()
  const { restaurantId } = useAuth()
  const [activeOrders, setActiveOrders] = useState<Order[]>([])
  const [historyOrders, setHistoryOrders] = useState<Order[]>([])
  const [pauseState, setPauseState] = useState<PauseState | null>(null)
  const [automationConfig, setAutomationConfig] = useState<{ auto_accept: boolean; auto_reject_enabled: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'history'>('active')

  const handleOrderEvent = useCallback((event: { eventType: string; new: Order }) => {
    if (event.eventType === 'INSERT') {
      setActiveOrders((prev) => [event.new, ...prev])
    } else if (event.eventType === 'UPDATE') {
      const updated = event.new
      const isActive = ['auth_success', 'accepted', 'preparing', 'ready'].includes(updated.status)
      setActiveOrders((prev) => {
        if (isActive) return prev.map((o) => o.id === updated.id ? updated : o).filter(Boolean)
        return prev.filter((o) => o.id !== updated.id)
      })
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      const [orders, pause, automation] = await Promise.all([
        api.orders.listActive().catch(() => [] as Order[]),
        api.admin.getPauseState().catch(() => null),
        api.admin.getAutomationConfig().catch(() => null),
      ])
      setActiveOrders(orders)
      setPauseState(pause)
      setAutomationConfig(automation)
      setLoading(false)
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    const unsubscribe = subscribeToOrders(restaurantId, handleOrderEvent)
    return unsubscribe
  }, [restaurantId, handleOrderEvent])

  useEffect(() => {
    if (tab !== 'history') return
    void api.admin.listTransactions(1).then((res) => {
      const completed = res.transactions
        .filter((t) => ['completed', 'rejected', 'refunded', 'missed'].includes(t.status))
        .slice(0, 50)
      setHistoryOrders(completed as unknown as Order[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleAccept(id: string) {
    const updated = await api.orders.acceptOrder(id)
    setActiveOrders((prev) => prev.map((o) => o.id === id ? updated : o))
  }

  async function handleReject(id: string) {
    const updated = await api.orders.rejectOrder(id)
    setActiveOrders((prev) => prev.filter((o) => o.id !== id))
    setHistoryOrders((prev) => [updated, ...prev])
  }

  async function handlePause(mode: PauseMode, minutes?: number) {
    const state = await api.admin.pauseOrders({ mode, duration_minutes: minutes })
    setPauseState(state)
  }

  async function handleUnpause() {
    const state = await api.admin.unpauseOrders()
    setPauseState(state)
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Orders</h2>
        <div className="flex items-center gap-1">
          {automationConfig?.auto_accept && (
            <a href="/payments" className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Auto-accept on</a>
          )}
          {automationConfig?.auto_reject_enabled && (
            <a href="/payments" className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Auto-reject on</a>
          )}
        </div>
      </div>

      {pauseState && (
        <PausePanel pause={pauseState} onPause={handlePause} onUnpause={handleUnpause} />
      )}

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('active')}
          className={`px-3 py-2 text-sm font-medium ${tab === 'active' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Active ({activeOrders.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-3 py-2 text-sm font-medium ${tab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          History
        </button>
      </div>

      {tab === 'active' && (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              No active orders
            </div>
          ) : (
            activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3">
          {historyOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              No order history
            </div>
          ) : (
            historyOrders.map((order, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{order.customer_name ?? String(order)}</p>
                  <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>{order.status}</span>
                  <span className="text-sm font-medium text-gray-900">${Number(order.total).toFixed(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
