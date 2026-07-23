import type { CreateOrderResult, WidgetSettings } from '../types'

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

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
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.875rem' }}>
          <span style={{ color: '#6b7280' }}>Order Total</span>
          <span style={{ fontWeight: 700 }}>{formatPrice(orderResult.total, currency)}</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
          {orderResult.order_number !== null ? `Order #${orderResult.order_number}` : 'Order confirmed'} · {formatDate(orderResult.created_at)}
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
