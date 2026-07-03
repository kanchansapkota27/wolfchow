import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  WidgetSettings,
  PublicMenuCategory,
  PublicMenuItem,
  CartItem,
  CheckoutForm,
  PromoValidation,
  CreateOrderResult,
  OrderTrackingResult,
  WidgetView,
  CartModifier,
} from './types'
import { createWidgetApi, WidgetApiError } from './api'
import { Menu } from './components/Menu'
import { ItemModal } from './components/ItemModal'
import { Cart } from './components/Cart'
import { Checkout } from './components/Checkout'
import { Success } from './components/Success'
import { OrderTracking } from './components/OrderTracking'
import { Notices } from './components/Notices'

export type WidgetLoadState = 'loading' | 'ready' | 'error'

interface AppProps {
  state: WidgetLoadState
  settings: WidgetSettings | null
  apiBase: string
  slug: string
}

const DEFAULT_FORM: CheckoutForm = {
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  payment_method: '',
  scheduled_for: null,
  promo_code: '',
  tip_amount: 0,
  notes: '',
  marketing_consent: false,
}

function Skeleton() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <div data-testid="skeleton" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[100, 100, 60].map((w, i) => (
          <div
            key={i}
            style={{
              height: '1.25rem',
              borderRadius: '0.25rem',
              background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.5s infinite',
              width: `${w}%`,
            }}
          />
        ))}
      </div>
      <style>{`@keyframes shimmer { 0%,100% { background-position: 0 0 } 50% { background-position: -200% 0 } }`}</style>
    </div>
  )
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function App({ state: loadState, settings: initialSettings, apiBase, slug }: AppProps) {
  const [view, setView] = useState<WidgetView>('menu')
  const [settings, setSettings] = useState<WidgetSettings | null>(initialSettings)
  const [menu, setMenu] = useState<PublicMenuCategory[]>([])
  const [menuLoaded, setMenuLoaded] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PublicMenuItem | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [form, setForm] = useState<CheckoutForm>(DEFAULT_FORM)
  const [promo, setPromo] = useState<PromoValidation | null>(null)
  const [orderResult, setOrderResult] = useState<CreateOrderResult | null>(null)
  const [tracking, setTracking] = useState<OrderTrackingResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const confirmCardRef = useRef<((clientSecret: string) => Promise<string>) | null>(null)

  const api = createWidgetApi(apiBase, slug)

  useEffect(() => {
    if (initialSettings && !settings) setSettings(initialSettings)
  }, [initialSettings])

  // Load menu once settings are ready
  useEffect(() => {
    if (loadState !== 'ready' || menuLoaded) return
    api.getMenu()
      .then((cats) => {
        setMenu(cats)
        setMenuLoaded(true)
      })
      .catch(() => setMenuLoaded(true))
  }, [loadState, menuLoaded])

  // Set default payment method
  useEffect(() => {
    if (settings && !form.payment_method && settings.payment_methods.length > 0) {
      const first = settings.payment_methods[0] ?? ''
      setForm((f) => ({ ...f, payment_method: first }))
    }
  }, [settings])

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartSubtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)

  const addToCart = useCallback((
    item: PublicMenuItem,
    variantId: string | null,
    variantName: string | null,
    basePrice: number,
    modifiers: CartModifier[],
    quantity: number,
    notes: string,
  ) => {
    const modifierTotal = modifiers.reduce((s, m) => s + m.price_delta, 0)
    const unitPrice = basePrice + modifierTotal

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (c) =>
          c.item_id === item.id &&
          c.variant_id === variantId &&
          JSON.stringify(c.modifiers) === JSON.stringify(modifiers) &&
          c.notes === notes,
      )
      if (existingIdx !== -1) {
        const updated = [...prev]
        const existing = updated[existingIdx]
        if (existing) updated[existingIdx] = { ...existing, quantity: existing.quantity + quantity }
        return updated
      }
      return [...prev, {
        id: generateId(),
        item_id: item.id,
        item_name: item.name,
        variant_id: variantId,
        variant_name: variantName,
        base_price: basePrice,
        modifiers,
        quantity,
        notes,
        unit_price: unitPrice,
      }]
    })
    setSelectedItem(null)
    setView('menu')
  }, [])

  const handleSelectItem = (item: PublicMenuItem) => {
    if (item.has_variants || (settings?.features.item_modifiers && item.modifier_groups.length > 0)) {
      setSelectedItem(item)
    }
  }

  const handleAddSimple = (item: PublicMenuItem) => {
    addToCart(item, null, null, item.price, [], 1, '')
  }

  const handleUpdateQty = (id: string, qty: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: qty } : i))
  }

  const handleRemove = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id))
  }

  const handleFormChange = useCallback((updates: Partial<CheckoutForm>) => {
    setForm((f) => ({ ...f, ...updates }))
  }, [])

  const handleValidatePromo = async (code: string, subtotal: number) => {
    try {
      const result = await api.validatePromo(code, subtotal)
      setPromo(result)
    } catch {
      setPromo({ valid: false, message: 'Could not validate promo code' })
    }
  }

  const handleSubmitOrder = async () => {
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const result = await api.createOrder(form, cart, promo?.valid ? promo.promo_id : undefined)

      // Card payment: authorise with Stripe then confirm with backend
      if (result.client_secret) {
        if (!confirmCardRef.current) {
          throw new Error('Card element not ready. Please refresh and try again.')
        }
        const paymentIntentId = await confirmCardRef.current(result.client_secret)
        await api.confirmOrder(result.order_id, paymentIntentId)
      }

      setOrderResult(result)
      setView('success')
      setCart([])
      setPromo(null)
      setForm(DEFAULT_FORM)
    } catch (err) {
      if (err instanceof WidgetApiError) {
        const body = err.body as Record<string, unknown> | undefined
        if (body?.error === 'orders_paused') {
          setSubmitError('Orders are currently paused. Please try again later.')
        } else if (body?.error === 'item_unavailable') {
          setSubmitError('One or more items in your cart are no longer available.')
        } else if (body?.error === 'payment_method_not_allowed') {
          setSubmitError('This payment method is not available.')
        } else if (body?.error === 'payment_intent_failed') {
          setSubmitError('Payment could not be processed. Please try again.')
        } else {
          setSubmitError('Failed to place order. Please try again.')
        }
      } else if (err instanceof Error) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Network error. Please check your connection.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTrackOrder = async () => {
    if (!orderResult) return
    try {
      const result = await api.getOrderTracking(orderResult.tracking_token)
      setTracking(result)
      setView('tracking')
    } catch {
      // Stay on success view if tracking fetch fails
    }
  }

  const handleRefreshTracking = async () => {
    if (!orderResult) return
    try {
      const result = await api.getOrderTracking(orderResult.tracking_token)
      setTracking(result)
    } catch {
      // silently fail
    }
  }

  if (loadState === 'error') {
    return (
      <div role="alert" style={{
        padding: '3rem 2rem',
        textAlign: 'center',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        height: '100%',
        background: '#fff',
      }}>
        <span style={{ fontSize: '2.5rem' }}>🍽️</span>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#111827' }}>Menu unavailable</p>
        <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', maxWidth: '16rem' }}>
          We couldn&apos;t load the menu right now. Please check your connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1.25rem',
            background: 'var(--brand-primary, #2563eb)',
            color: '#fff',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (loadState === 'loading' || !settings) {
    return <Skeleton />
  }

  return (
    <div style={{
      fontFamily: 'var(--font-family, system-ui, sans-serif)',
      color: 'var(--brand-text, #111827)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative',
      minHeight: '400px',
    }}>
      {view === 'menu' && (
        <>
          {settings.notices.length > 0 && (
            <div style={{ padding: '0.75rem 1rem 0', flexShrink: 0 }}>
              <Notices notices={settings.notices} location="storefront" />
            </div>
          )}
          {settings.orders_paused && (
            <div style={{ padding: '0 1rem', flexShrink: 0 }}>
              <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', background: '#fef3c7', border: '1px solid #fcd34d', marginBottom: '0.75rem' }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#92400e', fontSize: '0.875rem' }}>Orders are currently paused</p>
                {settings.pause_reason && <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: '#78350f' }}>{settings.pause_reason}</p>}
              </div>
            </div>
          )}
          {!menuLoaded ? (
            <Skeleton />
          ) : (
            <Menu
              categories={menu}
              settings={settings}
              cartCount={cartCount}
              cartTotal={cartSubtotal}
              onSelectItem={handleSelectItem}
              onViewCart={() => setView('cart')}
              onAddSimpleItem={settings.orders_paused ? () => undefined : handleAddSimple}
            />
          )}
        </>
      )}

      {view === 'cart' && (
        <Cart
          items={cart}
          settings={settings}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onCheckout={() => setView('checkout')}
          onBack={() => setView('menu')}
        />
      )}

      {view === 'checkout' && (
        <Checkout
          items={cart}
          settings={settings}
          form={form}
          promo={promo}
          onFormChange={handleFormChange}
          onValidatePromo={handleValidatePromo}
          onSubmit={handleSubmitOrder}
          onBack={() => setView('cart')}
          isSubmitting={isSubmitting}
          submitError={submitError}
          fetchSlots={settings.scheduling?.enabled ? () => api.getSlots() : null}
          onRegisterConfirmCard={(fn) => { confirmCardRef.current = fn }}
        />
      )}

      {view === 'success' && orderResult && (
        <Success
          orderResult={orderResult}
          settings={settings}
          onTrackOrder={handleTrackOrder}
          onNewOrder={() => setView('menu')}
        />
      )}

      {view === 'tracking' && tracking && (
        <OrderTracking
          tracking={tracking}
          settings={settings}
          onBack={() => setView('success')}
          onRefresh={handleRefreshTracking}
        />
      )}

      {selectedItem && !settings.orders_paused && (
        <ItemModal
          item={selectedItem}
          currency={settings.currency}
          showModifiers={settings.features.item_modifiers}
          onAdd={(variantId, variantName, basePrice, modifiers, quantity, notes) => {
            addToCart(selectedItem, variantId, variantName, basePrice, modifiers, quantity, notes)
          }}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
