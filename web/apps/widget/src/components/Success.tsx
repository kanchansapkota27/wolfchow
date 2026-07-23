import type { CreateOrderResult, WidgetSettings } from '../types'
import { formatCurrency } from '@wolfchow/utils'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface SuccessProps {
  orderResult: CreateOrderResult
  settings: WidgetSettings
  onTrackOrder: () => void
  onNewOrder: () => void
}

export function Success({ orderResult, settings, onTrackOrder, onNewOrder }: SuccessProps) {
  const currency = settings.currency

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2rem 1.5rem', textAlign: 'center' }}>
      <div
        style={{
          width: '4rem',
          height: '4rem',
          borderRadius: '9999px',
          background: '#dcfce7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          marginBottom: '1.25rem',
        }}
      >
        ✓
      </div>

      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.375rem', fontWeight: 700, color: '#111827' }}>
        Order Placed!
      </h2>
      <p style={{ margin: '0 0 1.5rem', color: '#6b7280', fontSize: '0.9375rem', lineHeight: 1.5 }}>
        Your order has been received. We'll get started on it right away.
      </p>

      <div style={{
        width: '100%',
        padding: '1rem',
        borderRadius: '0.75rem',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        marginBottom: '1.5rem',
        textAlign: 'left',
      }}>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
          {orderResult.order_number !== null ? `Order #${orderResult.order_number}` : 'Order confirmed'} · {formatDate(orderResult.created_at)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '0.75rem' }}>
          {orderResult.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', gap: '0.75rem' }}>
              <div>
                <div style={{ color: '#111827', fontWeight: 600 }}>
                  {item.quantity}× {item.item_name}
                  {item.variant_name ? ` (${item.variant_name})` : ''}
                </div>
                {item.modifiers.map((mod, midx) => (
                  <div key={midx} style={{ color: '#9ca3af', fontSize: '0.75rem' }}>+ {mod.name}</div>
                ))}
                {item.notes && (
                  <div style={{ color: '#9ca3af', fontSize: '0.75rem', fontStyle: 'italic' }}>"{item.notes}"</div>
                )}
              </div>
              <span style={{ color: '#374151', whiteSpace: 'nowrap' }}>{formatCurrency(item.unit_price * item.quantity, currency)}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
            <span style={{ color: '#6b7280' }}>Subtotal</span>
            <span>{formatCurrency(orderResult.subtotal, currency)}</span>
          </div>
          {orderResult.promo_discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: '#6b7280' }}>Discount</span>
              <span style={{ color: '#16a34a' }}>−{formatCurrency(orderResult.promo_discount, currency)}</span>
            </div>
          )}
          {orderResult.tax_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: '#6b7280' }}>Tax{orderResult.tax_inclusive ? ' (incl.)' : ''}</span>
              <span>{formatCurrency(orderResult.tax_amount, currency)}</span>
            </div>
          )}
          {orderResult.tip_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ color: '#6b7280' }}>Tip</span>
              <span>{formatCurrency(orderResult.tip_amount, currency)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9375rem', fontWeight: 700, marginTop: '0.25rem' }}>
            <span>Total</span>
            <span>{formatCurrency(orderResult.total, currency)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', width: '100%' }}>
        {settings.features.order_tracking_page && (
          <button
            onClick={onTrackOrder}
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
            Track My Order
          </button>
        )}
        <button
          onClick={onNewOrder}
          style={{
            width: '100%',
            padding: '0.875rem',
            borderRadius: '0.75rem',
            border: '1.5px solid #e5e7eb',
            background: '#fff',
            color: '#374151',
            fontWeight: 600,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          Order Something Else
        </button>
      </div>

      {!settings.features.remove_powered_by && (
        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#d1d5db' }}>
          Powered by RestroAPI
        </p>
      )}
    </div>
  )
}
