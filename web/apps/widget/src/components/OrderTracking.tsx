import type { OrderTrackingResult, WidgetSettings } from '../types'

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  pending_payment: { label: 'Awaiting Payment', color: '#9ca3af', step: 0 },
  auth_success: { label: 'Order Received', color: '#f59e0b', step: 1 },
  accepted: { label: 'Accepted', color: '#3b82f6', step: 2 },
  preparing: { label: 'Being Prepared', color: '#8b5cf6', step: 3 },
  ready: { label: 'Ready!', color: '#10b981', step: 4 },
  completed: { label: 'Completed', color: '#16a34a', step: 5 },
  rejected: { label: 'Order Rejected', color: '#ef4444', step: -1 },
  missed: { label: 'Order Missed', color: '#ef4444', step: -1 },
  refunded: { label: 'Refunded', color: '#6b7280', step: -1 },
}

const STEPS = ['Received', 'Accepted', 'Preparing', 'Ready', 'Done']

interface OrderTrackingProps {
  tracking: OrderTrackingResult
  settings: WidgetSettings
  onBack: () => void
  onRefresh: () => void
}

export function OrderTracking({ tracking, settings, onBack, onRefresh }: OrderTrackingProps) {
  const currency = settings.currency
  const status = STATUS_CONFIG[tracking.status] ?? { label: tracking.status, color: '#6b7280', step: 0 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.25rem', padding: 0 }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Order Status</h2>
        <button
          onClick={onRefresh}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-primary, #2563eb)', fontSize: '0.875rem', marginLeft: 'auto', padding: 0, fontWeight: 600 }}
        >
          Refresh
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {/* Status badge */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            display: 'inline-block',
            padding: '0.5rem 1.25rem',
            borderRadius: '9999px',
            background: `${status.color}20`,
            color: status.color,
            fontWeight: 700,
            fontSize: '0.9375rem',
            marginBottom: '0.5rem',
          }}>
            {status.label}
          </div>
          {tracking.status !== 'rejected' && tracking.status !== 'missed' && tracking.status !== 'refunded' && tracking.status !== 'completed' && (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>
              Est. ready: {new Date(tracking.estimated_ready).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>

        {/* Progress steps */}
        {status.step >= 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
            {STEPS.map((step, i) => (
              <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '9999px',
                  background: i <= status.step - 1 ? 'var(--brand-primary, #2563eb)' : '#e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                }}>
                  {i < status.step - 1 && <span style={{ color: '#fff', fontSize: '0.75rem' }}>✓</span>}
                  {i === status.step - 1 && <span style={{ width: '0.625rem', height: '0.625rem', borderRadius: '9999px', background: '#fff', display: 'block' }} />}
                </div>
                <span style={{ fontSize: '0.6875rem', color: '#9ca3af', marginTop: '0.25rem', textAlign: 'center' }}>{step}</span>
              </div>
            ))}
          </div>
        )}

        {/* Order summary */}
        <div style={{ padding: '1rem', borderRadius: '0.75rem', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
            {tracking.order_number !== null ? `Order #${tracking.order_number}` : 'Order'} · {formatDate(tracking.created_at)}
          </div>

          {tracking.items.map((item, i) => {
            const displayName = item.item_name ?? item.variant_name ?? 'Item'
            const variantSuffix = item.variant_name && item.variant_name !== item.item_name
              ? ` — ${item.variant_name}`
              : ''
            return (
              <div key={item.id ?? i} style={{ marginBottom: '0.625rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#374151', fontWeight: 500 }}>
                    {item.quantity}× {displayName}{variantSuffix}
                  </span>
                </div>
                {item.modifiers.length > 0 && (
                  <div style={{ paddingLeft: '1rem', marginTop: '0.125rem' }}>
                    {item.modifiers.map((mod, mi) => (
                      <div key={mi} style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        + {mod.name}
                      </div>
                    ))}
                  </div>
                )}
                {item.notes && (
                  <div style={{ paddingLeft: '1rem', marginTop: '0.125rem', fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                    Note: {item.notes}
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.75rem', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            {tracking.promo_discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                <span>Discount</span>
                <span>−{formatPrice(tracking.promo_discount, currency)}</span>
              </div>
            )}
            {tracking.tax_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                <span>Tax</span>
                <span>{formatPrice(tracking.tax_amount, currency)}</span>
              </div>
            )}
            {tracking.tip_amount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Tip</span>
                <span>{formatPrice(tracking.tip_amount, currency)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem' }}>
              <span>Total</span>
              <span>{formatPrice(tracking.total, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
