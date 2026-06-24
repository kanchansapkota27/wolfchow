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

// ── Pause duration picker ─────────────────────────────────────────────────────

const TIMED_OPTIONS: Array<{ label: string; minutes: number }> = [
  { label: '15 min', minutes: 15 },
  { label: '25 min', minutes: 25 },
  { label: '35 min', minutes: 35 },
]

interface PauseBannerProps {
  pause: PauseState
  onPause: (mode: PauseMode, minutes?: number) => Promise<void>
  onUnpause: () => Promise<void>
}

function PauseBanner({ pause, onPause, onUnpause }: PauseBannerProps) {
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)

  if (pause.orders_paused) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-800">
            Orders paused{pause.pause_mode === 'timed' && pause.pause_until ? ` — ${countdownLabel(pause.pause_until)}` : ''}
          </p>
          <p className="text-xs text-amber-600">{pause.pause_reason ?? 'New orders are not being accepted.'}</p>
        </div>
        <button
          onClick={async () => { setLoading(true); await onUnpause(); setLoading(false) }}
          disabled={loading}
          className="shrink-0 rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40"
        >
          Resume
        </button>
      </div>
    )
  }

  if (picking) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Pause for how long?</p>
        <div className="flex flex-wrap gap-2">
          {TIMED_OPTIONS.map(({ label, minutes }) => (
            <button
              key={minutes}
              onClick={async () => { setLoading(true); setPicking(false); await onPause('timed', minutes); setLoading(false) }}
              disabled={loading}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              {label}
            </button>
          ))}
          <button
            onClick={async () => { setLoading(true); setPicking(false); await onPause('manual'); setLoading(false) }}
            disabled={loading}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Manual
          </button>
          <button
            onClick={async () => { setLoading(true); setPicking(false); await onPause('rest_of_day'); setLoading(false) }}
            disabled={loading}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Rest of day
          </button>
          <button onClick={() => setPicking(false)} className="px-2 text-sm text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 px-5 py-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
        <svg className="h-5 w-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-green-800">Orders are Flowing</p>
        <p className="text-xs text-green-600">Customers can place orders for pickup, delivery or at tables.</p>
      </div>
      <button
        onClick={() => setPicking(true)}
        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6" />
        </svg>
        Pause System
      </button>
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
    <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{order.customer_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>{order.status}</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</span>
            {order.scheduled_for && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                Scheduled {new Date(order.scheduled_for).toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{itemsSummary}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-gray-900">${order.total.toFixed(2)}</p>
          {order.tip_amount > 0 && <p className="text-xs text-gray-500">tip ${order.tip_amount.toFixed(2)}</p>}
          <p className="mt-1 text-xs text-gray-400">{elapsedLabel(order.created_at)}</p>
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
        <div className="space-y-2 border-t border-gray-50 pt-3">
          <div className="space-y-1 text-xs text-gray-500">
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
                    <div className="space-y-0.5 pl-4 text-xs text-gray-500">
                      {item.modifiers.map((m, j) => (
                        <div key={j}>+ {m.name}{m.price_delta !== 0 ? ` ($${(m.price_delta / 100).toFixed(2)})` : ''}</div>
                      ))}
                    </div>
                  )}
                  {item.notes && <div className="pl-4 text-xs italic text-gray-400">{item.notes}</div>}
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
  const [view, setView] = useState<'live' | 'history'>('live')

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
        api.admin.listActiveOrders().catch(() => [] as Order[]),
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
    if (view !== 'history') return
    void api.admin.listTransactions(1).then((res) => {
      const completed = res.transactions
        .filter((t) => ['completed', 'rejected', 'refunded', 'missed'].includes(t.status))
        .slice(0, 50)
      setHistoryOrders(completed as unknown as Order[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

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

  const isLive = !pauseState?.orders_paused

  return (
    <div className="p-8 max-w-3xl space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Order Management</h2>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`inline-block h-2 w-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-amber-400'}`} />
              {isLive ? 'System is live and accepting orders' : 'Orders are currently paused'}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Auto-accept: {automationConfig?.auto_accept ? 'ON' : 'OFF'}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Auto-reject: {automationConfig?.auto_reject_enabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setView('live')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${view === 'live' ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>
            Live Feed
          </button>
          <button
            onClick={() => setView('history')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${view === 'history' ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
            History
          </button>
        </div>
      </div>

      {/* ── Status banner (live feed only) ── */}
      {view === 'live' && pauseState && (
        <PauseBanner pause={pauseState} onPause={handlePause} onUnpause={handleUnpause} />
      )}

      {/* ── Live orders ── */}
      {view === 'live' && (
        <div className="space-y-3">
          {activeOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-white py-16 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
                <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">No active orders</p>
              <p className="mt-1 text-xs text-gray-400">New orders will appear here in real-time.</p>
            </div>
          ) : (
            activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} onAccept={handleAccept} onReject={handleReject} />
            ))
          )}
        </div>
      )}

      {/* ── History ── */}
      {view === 'history' && (
        <div className="space-y-3">
          {historyOrders.length === 0 ? (
            <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-400">
              No order history
            </div>
          ) : (
            historyOrders.map((order, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{order.customer_name}</p>
                  <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>{order.status}</span>
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
