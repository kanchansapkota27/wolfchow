import type { CartItem, WidgetSettings } from '../types'
import { formatCurrency } from '@wolfchow/utils'

interface CartProps {
  items: CartItem[]
  settings: WidgetSettings
  onUpdateQty: (id: string, qty: number) => void
  onRemove: (id: string) => void
  onCheckout: () => void
  onBack: () => void
}

export function Cart({ items, settings, onUpdateQty, onRemove, onCheckout, onBack }: CartProps) {
  const currency = settings.currency
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  let taxDisplay = 0
  const taxLabel = settings.tax.inclusive ? 'Tax (included)' : 'Tax'
  if (settings.tax.enabled) {
    if (settings.tax.inclusive) {
      taxDisplay = Math.round(subtotal * settings.tax.rate / (100 + settings.tax.rate) * 100) / 100
    } else {
      taxDisplay = Math.round(subtotal * settings.tax.rate / 100 * 100) / 100
    }
  }

  const estimatedTotal = settings.tax.enabled && !settings.tax.inclusive
    ? subtotal + taxDisplay
    : subtotal

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.25rem', padding: 0, display: 'flex', alignItems: 'center' }}
          aria-label="Back to menu"
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Your Order</h2>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem 0', color: '#9ca3af' }}>
            <p style={{ fontSize: '1.5rem', margin: '0 0 0.5rem' }}>🛒</p>
            <p style={{ margin: 0 }}>Your cart is empty</p>
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '0.875rem 0',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              gap: '0.75rem',
            }}
          >
            {/* Qty controls */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
              <button
                onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                style={{
                  width: '1.75rem', height: '1.75rem',
                  borderRadius: '9999px',
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                }}
              >
                +
              </button>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{item.quantity}</span>
              <button
                onClick={() => item.quantity > 1 ? onUpdateQty(item.id, item.quantity - 1) : onRemove(item.id)}
                style={{
                  width: '1.75rem', height: '1.75rem',
                  borderRadius: '9999px',
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                  color: item.quantity === 1 ? '#ef4444' : '#111',
                }}
              >
                {item.quantity === 1 ? '🗑' : '−'}
              </button>
            </div>

            {/* Details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
                {item.item_name}
              </p>
              {item.variant_name && (
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                  {item.variant_name}
                </p>
              )}
              {item.modifiers.length > 0 && (
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                  {item.modifiers.map((m) => m.name).join(', ')}
                </p>
              )}
              {item.notes && (
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                  {item.notes}
                </p>
              )}
            </div>

            {/* Price */}
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem' }}>
                {formatCurrency(item.unit_price * item.quantity, currency)}
              </p>
              {item.quantity > 1 && (
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                  {formatCurrency(item.unit_price, currency)} each
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {items.length > 0 && (
        <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.9375rem' }}>
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal, currency)}</span>
          </div>
          {settings.tax.enabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.875rem', color: '#6b7280' }}>
              <span>{taxLabel}</span>
              <span>{formatCurrency(taxDisplay, currency)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', marginBottom: '1rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
            <span>Estimated Total</span>
            <span>{formatCurrency(estimatedTotal, currency)}</span>
          </div>

          <button
            onClick={onCheckout}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: 'var(--brand-primary, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Continue to Checkout
          </button>
        </div>
      )}
    </div>
  )
}
