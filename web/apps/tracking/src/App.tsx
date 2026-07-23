import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatCurrency } from '@wolfchow/utils'
import { RealtimeProvider, useRealtime } from '@wolfchow/realtime'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8789'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackingItem {
  id: string
  item_name: string | null
  variant_name: string | null
  quantity: number
  modifiers: Array<{ name: string }>
  notes: string | null
}

interface TrackingOrder {
  order_id: string
  tracking_token: string
  order_number: number | null
  restaurant_id: string
  restaurant_name: string
  status: string
  payment_method: string
  customer_name: string
  subtotal: number
  promo_discount: number
  tax_amount: number
  tip_amount: number
  total: number
  created_at: string
  scheduled_for: string | null
  estimated_ready: string
  items: TrackingItem[]
}

// ── Status configuration ───────────────────────────────────────────────────────

const STEP_STATUSES: Record<string, number> = {
  pending_payment: 0,
  auth_success: 1,
  accepted: 2,
  preparing: 3,
  ready: 4,
  completed: 5,
}

const STEPS = ['Received', 'Confirmed', 'Accepted', 'Preparing', 'Ready', 'Done']

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pending payment', color: '#9ca3af' },
  auth_success: { label: 'Awaiting confirmation', color: '#3b82f6' },
  accepted: { label: 'Accepted', color: '#6366f1' },
  preparing: { label: 'Being prepared', color: '#f59e0b' },
  ready: { label: 'Ready for pickup!', color: '#10b981' },
  completed: { label: 'Completed', color: '#16a34a' },
  rejected: { label: 'Order not accepted', color: '#ef4444' },
  missed: { label: 'Order missed', color: '#ef4444' },
  refunded: { label: 'Refunded', color: '#8b5cf6' },
}

const TERMINAL_STATUSES = new Set(['completed', 'rejected', 'missed', 'refunded'])

const STATUS_EMOJI: Record<string, string> = {
  pending_payment: '⏳',
  auth_success: '🔵',
  accepted: '🔵',
  preparing: '🟡',
  ready: '🟢',
  completed: '✅',
  rejected: '🔴',
  missed: '🔴',
  refunded: '🟣',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  pickup: 'Pay at pickup',
  delivery: 'Pay on delivery',
}

class TrackingNotFoundError extends Error {}

async function fetchTrackingOrder(apiBase: string, token: string): Promise<TrackingOrder> {
  const res = await fetch(`${apiBase}/public/track/${encodeURIComponent(token)}`)
  if (res.status === 404) throw new TrackingNotFoundError('Order not found')
  if (!res.ok) throw new Error(`tracking fetch failed: ${res.status}`)
  return res.json() as Promise<TrackingOrder>
}

// ── Token extraction ───────────────────────────────────────────────────────────

function extractToken(): string | null {
  const params = new URLSearchParams(window.location.search)
  if (params.get('token')) return params.get('token')
  const path = window.location.pathname.replace(/^\/+/, '')
  return path || null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return formatCurrency(n, 'USD')
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Components ────────────────────────────────────────────────────────────────

function StatusStepper({ status }: { status: string }) {
  const step = STEP_STATUSES[status] ?? 0
  const isNegative = status === 'rejected' || status === 'missed'

  if (isNegative) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✗</div>
        <p style={{ color: '#ef4444', fontWeight: 700, fontSize: '1rem', margin: 0 }}>
          {STATUS_LABELS[status]?.label ?? status}
        </p>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Any payment hold will be released within 5–7 business days.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', padding: '0 0.5rem' }}>
        {STEPS.map((label, i) => {
          const done = i < step
          const active = i === step
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {/* connector line */}
              {i < STEPS.length - 1 && (
                <div style={{
                  position: 'absolute',
                  top: '0.75rem',
                  left: '50%',
                  width: '100%',
                  height: '2px',
                  background: done ? '#2563eb' : '#e5e7eb',
                  zIndex: 0,
                }} />
              )}
              {/* dot */}
              <div style={{
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '9999px',
                background: done ? '#2563eb' : active ? '#2563eb' : '#e5e7eb',
                border: active ? '3px solid #2563eb' : 'none',
                boxShadow: active ? '0 0 0 3px #bfdbfe' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
                transition: 'all 0.3s',
                flexShrink: 0,
              }}>
                {done && <span style={{ color: '#fff', fontSize: '0.75rem', lineHeight: 1 }}>✓</span>}
                {active && <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '9999px', background: '#fff', display: 'block' }} />}
              </div>
              <span style={{
                marginTop: '0.4rem',
                fontSize: '0.625rem',
                fontWeight: active ? 700 : 400,
                color: active ? '#1d4ed8' : done ? '#374151' : '#9ca3af',
                textAlign: 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OrderSummary({ order }: { order: TrackingOrder }) {
  const statusDisplay = STATUS_LABELS[order.status] ?? { label: order.status, color: '#6b7280' }
  const isScheduledPending =
    !!order.scheduled_for &&
    new Date(order.scheduled_for).getTime() > Date.now() &&
    !TERMINAL_STATUSES.has(order.status)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* status badge */}
      <div style={{ textAlign: 'center' }}>
        <span data-testid="order-status" style={{
          display: 'inline-block',
          padding: '0.375rem 1rem',
          borderRadius: '9999px',
          background: `${statusDisplay.color}18`,
          color: statusDisplay.color,
          fontWeight: 700,
          fontSize: '0.875rem',
        }}>
          {statusDisplay.label}
        </span>
        {!isScheduledPending && order.status !== 'rejected' && order.status !== 'missed' && order.status !== 'completed' && order.status !== 'refunded' && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Est. ready by {fmtTime(order.estimated_ready)}
          </p>
        )}
        {order.scheduled_for && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Scheduled for {new Date(order.scheduled_for).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
      </div>

      {/* status stepper (or scheduled pre-step) */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', border: '1px solid #e5e7eb', padding: '1.25rem 0.75rem' }}>
        {isScheduledPending ? (
          <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📅</div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9375rem', color: '#374151' }}>
              We&apos;ll start preparing closer to your scheduled time.
            </p>
          </div>
        ) : (
          <StatusStepper status={order.status} />
        )}
      </div>

      {/* items */}
      <div style={{ background: '#fff', borderRadius: '0.75rem', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#374151' }}>
            Order Summary
          </span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
            {order.order_number !== null ? `#${order.order_number}` : `#${order.order_id.slice(0, 8).toUpperCase()}`} · {fmtDate(order.created_at)}
          </span>
        </div>

        <div style={{ padding: '0.75rem 1rem' }}>
          {order.items.map((item, i) => {
            const name = item.item_name ?? item.variant_name ?? 'Item'
            const variant = item.variant_name && item.variant_name !== item.item_name ? item.variant_name : null
            return (
              <div key={item.id ?? i} style={{ marginBottom: i < order.items.length - 1 ? '0.875rem' : 0 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 700, color: '#2563eb', minWidth: '1.5rem', flexShrink: 0 }}>{item.quantity}×</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>{name}</p>
                    {variant && <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>{variant}</p>}
                    {item.modifiers.length > 0 && (
                      <div style={{ marginTop: '0.25rem' }}>
                        {item.modifiers.map((m, mi) => (
                          <p key={mi} style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>+ {m.name}</p>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                        Note: {item.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ borderTop: '1px solid #f3f4f6', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
            <span>Payment</span>
            <span>{PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
            <span>Subtotal</span>
            <span>{fmt(order.subtotal)}</span>
          </div>
          {order.promo_discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#16a34a' }}>
              <span>Discount</span>
              <span>−{fmt(order.promo_discount)}</span>
            </div>
          )}
          {order.tax_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
              <span>Tax</span>
              <span>{fmt(order.tax_amount)}</span>
            </div>
          )}
          {order.tip_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#6b7280' }}>
              <span>Tip</span>
              <span>{fmt(order.tip_amount)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', color: '#111827', paddingTop: '0.375rem', borderTop: '1px solid #f3f4f6', marginTop: '0.125rem' }}>
            <span>Total</span>
            <span>{fmt(order.total)}</span>
          </div>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: '0.6875rem', color: '#d1d5db', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0.5rem 0 0' }}>
        Powered by Wolfchow
      </p>
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'error' | 'not_found' | 'ready'

export function App() {
  const token = extractToken()
  const qc = useQueryClient()

  const { data: order, isPending, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['tracking-order', token],
    queryFn: () => fetchTrackingOrder(API_BASE, token!),
    enabled: !!token,
    retry: false,
    refetchInterval: (query) => {
      const current = query.state.data
      return current && !TERMINAL_STATUSES.has(current.status) ? 10_000 : false
    },
  })

  const state: LoadState = !token
    ? 'ready' // unreachable render path below handles !token before using `state`
    : isPending ? 'loading'
    : isError ? (error instanceof TrackingNotFoundError ? 'not_found' : 'error')
    : 'ready'

  useEffect(() => {
    if (!order) return
    const emoji = STATUS_EMOJI[order.status] ?? ''
    const label = STATUS_LABELS[order.status]?.label ?? order.status
    document.title = `${emoji} ${label} — Your Order | Wolfchow`.trim()
  }, [order?.status])

  const containerStyle: React.CSSProperties = {
    minHeight: '100dvh',
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '0',
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '480px',
    padding: '1.25rem',
    flex: 1,
  }

  if (!token) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Header />
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 0.5rem' }}>Invalid tracking link</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>Please use the link from your confirmation email.</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Header />
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <div style={{ width: '2rem', height: '2rem', border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '9999px', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <p style={{ marginTop: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>Loading order…</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'not_found') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Header />
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 0.5rem' }}>Order not found</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>This tracking link may have expired or is incorrect.</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Header />
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
            <p style={{ fontWeight: 600, color: '#374151', margin: '0 0 0.5rem' }}>Couldn't load order</p>
            <p style={{ fontSize: '0.875rem', margin: '0 0 1.25rem' }}>Please try again in a moment.</p>
            <button
              onClick={() => refetch()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.625rem 1.25rem', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <RealtimeProvider restaurantId={order!.restaurant_id}>
      <RealtimeStatusSync
        orderId={order!.order_id}
        onStatusChange={(newStatus) =>
          qc.setQueryData<TrackingOrder>(['tracking-order', token], (o) => o && { ...o, status: newStatus })
        }
      />
      <div style={containerStyle}>
        <div style={cardStyle}>
          <Header restaurantName={order!.restaurant_name}>
            {!TERMINAL_STATUSES.has(order!.status) && (
              <button
                onClick={() => refetch()}
                title={`Last updated ${fmtTime(new Date(dataUpdatedAt).toISOString())}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: '0.8125rem', fontWeight: 600, padding: 0 }}
              >
                Refresh
              </button>
            )}
          </Header>
          <OrderSummary order={order!} />
        </div>
      </div>
    </RealtimeProvider>
  )
}

/**
 * Renders nothing — just wires the order_status_changed/order_accepted/
 * order_rejected broadcast events into the order state. The channel is
 * restaurant-wide (other customers' orders flow through it too), so every
 * handler filters to `payload.order_id === orderId` before acting.
 */
function RealtimeStatusSync({ orderId, onStatusChange }: { orderId: string; onStatusChange: (status: string) => void }) {
  const { subscribe } = useRealtime()

  useEffect(() => {
    const unsubStatusChanged = subscribe('order_status_changed', (_event, payload) => {
      if (payload.order_id !== orderId) return
      const newStatus = payload.new_status
      if (typeof newStatus === 'string') onStatusChange(newStatus)
    })
    const unsubAccepted = subscribe('order_accepted', (_event, payload) => {
      if (payload.order_id === orderId) onStatusChange('accepted')
    })
    const unsubRejected = subscribe('order_rejected', (_event, payload) => {
      if (payload.order_id === orderId) onStatusChange('rejected')
    })
    return () => {
      unsubStatusChanged()
      unsubAccepted()
      unsubRejected()
    }
  }, [orderId, subscribe, onStatusChange])

  return null
}

function Header({ restaurantName, children }: { restaurantName?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.875rem', borderBottom: '1px solid #e5e7eb' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
          {restaurantName ?? 'Wolfchow'}
        </h1>
        <p style={{ margin: 0, fontSize: '0.6875rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
          Order Tracking
        </p>
      </div>
      {children}
    </div>
  )
}
