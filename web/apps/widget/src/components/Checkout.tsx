import { useState, useCallback, useRef, useEffect } from 'react'
import type { Stripe, StripeCardElement } from '@stripe/stripe-js'
import type { CartItem, CheckoutForm, PromoValidation, WidgetSettings } from '../types'
import { formatCurrency } from '@wolfchow/utils'
import { Notices } from './Notices'

// Load Stripe.js from CDN (more reliable than @stripe/stripe-js in bundled IIFE context)
function createStripeInstance(publishableKey: string): Promise<Stripe> {
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    return Promise.reject(
      new Error(`Stripe key must start with pk_test_ or pk_live_ — got "${publishableKey.slice(0, 12)}…". ` +
        'Set your Stripe publishable key (not the secret key) in Admin → Payments.'),
    )
  }

  return new Promise((resolve, reject) => {
    const win = window as unknown as Record<string, unknown>

    const init = () => {
      const Constructor = win['Stripe'] as ((key: string) => Stripe) | undefined
      if (Constructor) {
        try { resolve(Constructor(publishableKey)) }
        catch (e) { reject(e) }
      } else {
        reject(new Error('Stripe.js loaded but window.Stripe is not available'))
      }
    }

    if (win['Stripe']) { init(); return }

    let script = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3/"]')
    const alreadyInDom = !!script

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://js.stripe.com/v3/'
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', init, { once: true })
    script.addEventListener('error', () =>
      reject(new Error('Failed to fetch https://js.stripe.com/v3/ — check internet connection or CSP headers')),
    { once: true })

    // Already in DOM but not yet initialised → listeners above handle it.
    // Already in DOM AND script already ran (Stripe set synchronously before our listener) → call init now.
    if (alreadyInDom && win['Stripe']) init()
  })
}

// ── Slot helpers (timezone-aware) ─────────────────────────────────────────────

function localDateOf(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoStr))
}

function groupSlotsByDate(slots: string[], tz: string): Map<string, string[]> {
  const now = Date.now()
  const groups = new Map<string, string[]>()
  for (const slot of slots) {
    if (new Date(slot).getTime() <= now) continue  // filter already-past slots
    const d = localDateOf(slot, tz)
    const arr = groups.get(d) ?? []
    arr.push(slot)
    groups.set(d, arr)
  }
  return groups
}

function formatDateChip(dateStr: string, firstSlotInDay: string, tz: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + 86400000),
  )
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  // Use the slot timestamp displayed in restaurant tz to get the correct weekday/date
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(firstSlotInDay))
}

function formatSlotTime(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoStr))
}

interface CheckoutProps {
  items: CartItem[]
  settings: WidgetSettings
  form: CheckoutForm
  promo: PromoValidation | null
  onFormChange: (updates: Partial<CheckoutForm>) => void
  onValidatePromo: (code: string, subtotal: number) => Promise<void>
  onSubmit: () => Promise<void>
  onBack: () => void
  isSubmitting: boolean
  submitError: string | null
  /** Null when the plan does not include scheduled orders. */
  fetchSlots: (() => Promise<string[]>) | null
  /** Called with a confirm function when Stripe card element is ready, null when unmounted.
   *  The function resolves with the Stripe paymentIntent.id so the caller can hit /confirm. */
  onRegisterConfirmCard: (fn: ((clientSecret: string) => Promise<string>) | null) => void
}

const PAYMENT_LABELS: Record<string, string> = {
  card: '💳 Pay by Card',
  pickup: '🥡 Pay on Pickup',
  delivery: '🛵 Pay on Delivery',
}

export function Checkout({
  items,
  settings,
  form,
  promo,
  onFormChange,
  onValidatePromo,
  onSubmit,
  onBack,
  isSubmitting,
  submitError,
  fetchSlots,
  onRegisterConfirmCard,
}: CheckoutProps) {
  const [promoInput, setPromoInput] = useState(form.promo_code)
  const [promoLoading, setPromoLoading] = useState(false)
  const [customTip, setCustomTip] = useState('')
  const currency = settings.currency
  const timezone = settings.timezone || 'UTC'
  const prepMins = settings.scheduling?.base_prep_minutes

  // Stripe card element refs and status
  // cardContainerRef: placeholder div in Shadow DOM — used only for position/size measurement.
  // Stripe itself mounts into a light-DOM div (lightStripeRef) because Stripe Elements
  // cannot be mounted inside a Shadow Root (it validates DOM ancestry and rejects).
  const cardContainerRef = useRef<HTMLDivElement>(null)
  const lightStripeRef = useRef<HTMLDivElement | null>(null)
  const stripeRef = useRef<Stripe | null>(null)
  const cardElementRef = useRef<StripeCardElement | null>(null)
  const checkoutScrollRef = useRef<HTMLDivElement>(null)
  const [cardStatus, setCardStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [stripeLoadError, setStripeLoadError] = useState<string | null>(null)
  const onRegisterRef = useRef(onRegisterConfirmCard)
  useEffect(() => { onRegisterRef.current = onRegisterConfirmCard })

  // Load and mount Stripe card element when 'card' is selected
  useEffect(() => {
    if (form.payment_method !== 'card' || !settings.stripe_publishable_key) {
      cardElementRef.current?.destroy()
      cardElementRef.current = null
      stripeRef.current = null
      lightStripeRef.current?.remove()
      lightStripeRef.current = null
      onRegisterRef.current(null)
      if (form.payment_method !== 'card') {
        setCardStatus('idle')
        setStripeLoadError(null)
      }
      return
    }

    if (cardElementRef.current) return  // already mounted

    let active = true
    setCardStatus('loading')
    setStripeLoadError(null)

    // Create a light-DOM container positioned over the shadow-DOM placeholder.
    // position:fixed + getBoundingClientRect() maps shadow viewport coords to light DOM.
    const lightDiv = document.createElement('div')
    lightDiv.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'box-sizing:border-box',
      'padding:0.75rem',
      'background:#fafafa',
      'border:1.5px solid #e5e7eb',
      'border-radius:0.5rem',
      'pointer-events:auto',
      'visibility:hidden',   // hidden until first sync
    ].join(';')
    document.body.appendChild(lightDiv)
    lightStripeRef.current = lightDiv

    // Sync the overlay position to the placeholder on every layout change.
    const sync = () => {
      const placeholder = cardContainerRef.current
      if (!placeholder || !lightDiv.isConnected) return
      const r = placeholder.getBoundingClientRect()
      const scrollEl = checkoutScrollRef.current
      // Hide if scrolled out of the widget's visible area
      const inWidget = !scrollEl || (() => {
        const sr = scrollEl.getBoundingClientRect()
        return r.bottom > sr.top && r.top < sr.bottom
      })()
      if (!inWidget || r.width === 0) {
        lightDiv.style.visibility = 'hidden'
        return
      }
      lightDiv.style.left = `${r.left}px`
      lightDiv.style.top = `${r.top}px`
      lightDiv.style.width = `${r.width}px`
      lightDiv.style.height = `${r.height}px`
      lightDiv.style.visibility = 'visible'
    }

    const scrollEl = checkoutScrollRef.current
    if (scrollEl) scrollEl.addEventListener('scroll', sync, { passive: true })
    // capture:true catches scroll on any ancestor (page-level scrolling)
    window.addEventListener('scroll', sync, { capture: true, passive: true })
    window.addEventListener('resize', sync, { passive: true })
    const resizeObs = new ResizeObserver(sync)
    if (cardContainerRef.current) resizeObs.observe(cardContainerRef.current)

    createStripeInstance(settings.stripe_publishable_key!).then((stripe) => {
      if (!active || !lightDiv.isConnected) return
      if (cardElementRef.current) return  // race guard

      stripeRef.current = stripe
      const elements = stripe.elements()
      const card = elements.create('card', {
        style: {
          base: {
            fontSize: '15px',
            fontFamily: 'system-ui, sans-serif',
            color: '#111827',
            '::placeholder': { color: '#9ca3af' },
          },
          invalid: { color: '#ef4444' },
        },
      })
      card.mount(lightDiv)  // light DOM — Stripe accepts this
      cardElementRef.current = card
      sync()  // position before making visible
      setCardStatus('ready')

      onRegisterRef.current(async (clientSecret: string): Promise<string> => {
        if (!stripeRef.current || !cardElementRef.current) {
          throw new Error('Card element not available. Please refresh and try again.')
        }
        const result = await stripeRef.current.confirmCardPayment(clientSecret, {
          payment_method: { card: cardElementRef.current },
        })
        if (result.error) {
          throw new Error(result.error.message ?? 'Payment failed. Please try again.')
        }
        if (!result.paymentIntent?.id) {
          throw new Error('Payment authorisation incomplete. Please try again.')
        }
        return result.paymentIntent.id
      })
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[RestroAPI Widget] Stripe init failed:', msg)
      if (active) {
        setStripeLoadError(msg)
        setCardStatus('error')
      }
    })

    return () => {
      active = false
      resizeObs.disconnect()
      if (scrollEl) scrollEl.removeEventListener('scroll', sync)
      window.removeEventListener('scroll', sync, { capture: true })
      window.removeEventListener('resize', sync)
      cardElementRef.current?.destroy()
      cardElementRef.current = null
      stripeRef.current = null
      lightDiv.remove()
      lightStripeRef.current = null
      onRegisterRef.current(null)
      setCardStatus('idle')
    }
  }, [form.payment_method, settings.stripe_publishable_key])

  // Scheduling state
  const [orderMode, setOrderMode] = useState<'asap' | 'scheduled'>('asap')
  const [slotsStatus, setSlotsStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [slotGroups, setSlotGroups] = useState<Map<string, string[]>>(new Map())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const slotDates = [...slotGroups.keys()]
  const slotsForDate = selectedDate ? (slotGroups.get(selectedDate) ?? []) : []

  const handleModeChange = useCallback(async (mode: 'asap' | 'scheduled') => {
    setOrderMode(mode)
    if (mode === 'asap') {
      onFormChange({ scheduled_for: null })
      return
    }
    if (slotsStatus !== 'idle' && slotsStatus !== 'error') return
    setSlotsStatus('loading')
    try {
      const slots = await fetchSlots!()
      const groups = groupSlotsByDate(slots, timezone)
      setSlotGroups(groups)
      setSlotsStatus('loaded')
      const firstDate = [...groups.keys()][0] ?? null
      setSelectedDate(firstDate)
      if (firstDate) {
        const firstSlot = groups.get(firstDate)?.[0] ?? null
        onFormChange({ scheduled_for: firstSlot })
      }
    } catch {
      setSlotsStatus('error')
    }
  }, [fetchSlots, slotsStatus, timezone, onFormChange])

  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  const promoDiscount = promo?.valid ? (promo.discount_amount ?? 0) : 0
  const discountedSubtotal = Math.max(0, subtotal - promoDiscount)
  const tipAmount = form.tip_amount

  let taxAmount = 0
  if (settings.tax.enabled) {
    if (settings.tax.inclusive) {
      taxAmount = Math.round(discountedSubtotal * settings.tax.rate / (100 + settings.tax.rate) * 100) / 100
    } else {
      taxAmount = Math.round(discountedSubtotal * settings.tax.rate / 100 * 100) / 100
    }
  }

  const total = settings.tax.enabled && !settings.tax.inclusive
    ? discountedSubtotal + taxAmount + tipAmount
    : discountedSubtotal + tipAmount

  const handlePromoApply = async () => {
    if (!promoInput.trim()) return
    setPromoLoading(true)
    try {
      onFormChange({ promo_code: promoInput.trim() })
      await onValidatePromo(promoInput.trim(), subtotal)
    } finally {
      setPromoLoading(false)
    }
  }

  const handleTipSelect = (preset: number) => {
    const tipValue = Math.round(discountedSubtotal * preset / 100 * 100) / 100
    onFormChange({ tip_amount: tipValue })
    setCustomTip('')
  }

  const handleCustomTip = (val: string) => {
    setCustomTip(val)
    const parsed = parseFloat(val)
    if (!isNaN(parsed) && parsed >= 0) onFormChange({ tip_amount: parsed })
    else onFormChange({ tip_amount: 0 })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1.5px solid #e5e7eb',
    fontSize: '0.9375rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.25rem', padding: 0 }}
          aria-label="Back to cart"
          disabled={isSubmitting}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Checkout</h2>
      </div>

      <div ref={checkoutScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
        <Notices notices={settings.notices} location="checkout" />

        {/* Customer details */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0.75rem 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
            Your Details
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Name *"
              value={form.customer_name}
              onChange={(e) => onFormChange({ customer_name: e.target.value })}
              style={inputStyle}
              required
              disabled={isSubmitting}
            />
            <input
              type="email"
              placeholder="Email *"
              value={form.customer_email}
              onChange={(e) => onFormChange({ customer_email: e.target.value })}
              style={inputStyle}
              required
              disabled={isSubmitting}
            />
            <input
              type="tel"
              placeholder="Phone (optional)"
              value={form.customer_phone}
              onChange={(e) => onFormChange({ customer_phone: e.target.value })}
              style={inputStyle}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Payment method */}
        {settings.payment_methods.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
              Payment Method
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {settings.payment_methods.map((method) => (
                <label
                  key={method}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.5rem',
                    border: `1.5px solid ${form.payment_method === method ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                    background: form.payment_method === method ? 'rgba(37,99,235,0.06)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9375rem',
                  }}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={method}
                    checked={form.payment_method === method}
                    onChange={() => onFormChange({ payment_method: method })}
                    style={{ accentColor: 'var(--brand-primary, #2563eb)' }}
                    disabled={isSubmitting}
                  />
                  {PAYMENT_LABELS[method] ?? method}
                </label>
              ))}
            </div>
            {settings.pickup_delivery_note && (form.payment_method === 'pickup' || form.payment_method === 'delivery') && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                {settings.pickup_delivery_note}
              </p>
            )}
          </div>
        )}

        {/* Stripe card element */}
        {form.payment_method === 'card' && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
              Card Details
            </h3>
            {!settings.stripe_publishable_key ? (
              <p style={{ margin: 0, padding: '0.75rem', color: '#dc2626', fontSize: '0.875rem', background: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fca5a5' }}>
                Card payments are not configured. Please choose a different payment method.
              </p>
            ) : cardStatus === 'error' ? (
              <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fca5a5' }}>
                <p style={{ margin: '0 0 0.25rem', color: '#dc2626', fontSize: '0.875rem', fontWeight: 600 }}>
                  Could not load secure card form.
                </p>
                {stripeLoadError && (
                  <p style={{ margin: 0, color: '#991b1b', fontSize: '0.8125rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {stripeLoadError}
                  </p>
                )}
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                {cardStatus === 'loading' && (
                  <p style={{ margin: 0, padding: '0.75rem', color: '#9ca3af', fontSize: '0.875rem' }}>
                    Loading card form…
                  </p>
                )}
                {/* Shadow DOM position anchor — invisible; the light DOM overlay provides the visual card input */}
                <div
                  ref={cardContainerRef}
                  style={{
                    height: cardStatus === 'loading' ? 0 : '2.75rem',
                    visibility: 'hidden',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Order timing — ASAP or scheduled */}
        {fetchSlots && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
              Order Timing
            </h3>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: orderMode === 'scheduled' ? '0.75rem' : 0 }}>
              {/* ASAP button */}
              <button
                type="button"
                onClick={() => void handleModeChange('asap')}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1.5px solid ${orderMode === 'asap' ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                  background: orderMode === 'asap' ? 'rgba(37,99,235,0.06)' : '#fff',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.9375rem',
                  fontWeight: orderMode === 'asap' ? 600 : 400,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.125rem',
                }}
              >
                <span>ASAP</span>
                {prepMins && (
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400 }}>
                    ~{prepMins} min
                  </span>
                )}
              </button>

              {/* Schedule button */}
              <button
                type="button"
                onClick={() => void handleModeChange('scheduled')}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: '0.625rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: `1.5px solid ${orderMode === 'scheduled' ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                  background: orderMode === 'scheduled' ? 'rgba(37,99,235,0.06)' : '#fff',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '0.9375rem',
                  fontWeight: orderMode === 'scheduled' ? 600 : 400,
                  textAlign: 'left',
                }}
              >
                Schedule for later
              </button>
            </div>

            {/* Slot picker (shown when mode = scheduled) */}
            {orderMode === 'scheduled' && (
              <>
                {slotsStatus === 'loading' && (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                    Loading available times…
                  </p>
                )}
                {slotsStatus === 'error' && (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#dc2626' }}>
                    Could not load available times. Check that operating hours are configured, or choose ASAP.
                  </p>
                )}
                {slotsStatus === 'loaded' && slotDates.length === 0 && (
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                    No upcoming slots available. Please choose ASAP.
                  </p>
                )}
                {slotsStatus === 'loaded' && slotDates.length > 0 && (
                  <>
                    {/* Date chips */}
                    <div style={{
                      display: 'flex',
                      gap: '0.375rem',
                      overflowX: 'auto',
                      paddingBottom: '0.375rem',
                      marginBottom: '0.5rem',
                    }}>
                      {slotDates.map((dateStr) => {
                        const firstSlot = slotGroups.get(dateStr)?.[0] ?? dateStr
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            onClick={() => {
                              setSelectedDate(dateStr)
                              const first = slotGroups.get(dateStr)?.[0] ?? null
                              onFormChange({ scheduled_for: first })
                            }}
                            disabled={isSubmitting}
                            style={{
                              flexShrink: 0,
                              padding: '0.375rem 0.75rem',
                              borderRadius: '9999px',
                              border: `1.5px solid ${selectedDate === dateStr ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                              background: selectedDate === dateStr ? 'rgba(37,99,235,0.06)' : '#fff',
                              cursor: isSubmitting ? 'not-allowed' : 'pointer',
                              fontSize: '0.8125rem',
                              fontWeight: selectedDate === dateStr ? 600 : 400,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {formatDateChip(dateStr, firstSlot, timezone)}
                          </button>
                        )
                      })}
                    </div>

                    {/* Time dropdown */}
                    {selectedDate && slotsForDate.length > 0 && (
                      <select
                        value={form.scheduled_for ?? ''}
                        onChange={(e) => onFormChange({ scheduled_for: e.target.value || null })}
                        disabled={isSubmitting}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        {slotsForDate.map((slot) => (
                          <option key={slot} value={slot}>
                            {formatSlotTime(slot, timezone)}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Promo code */}
        {settings.features.promotions_enabled && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
              Promo Code
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Enter code"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                style={{ ...inputStyle, flex: 1 }}
                disabled={isSubmitting}
              />
              <button
                onClick={handlePromoApply}
                disabled={promoLoading || isSubmitting}
                style={{
                  padding: '0.625rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1.5px solid var(--brand-primary, #2563eb)',
                  background: '#fff',
                  color: 'var(--brand-primary, #2563eb)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                }}
              >
                {promoLoading ? '...' : 'Apply'}
              </button>
            </div>
            {promo && (
              <p style={{ margin: '0.375rem 0 0', fontSize: '0.8125rem', color: promo.valid ? '#16a34a' : '#dc2626' }}>
                {promo.valid ? `✓ ${promo.title} — ${formatCurrency(promo.discount_amount ?? 0, currency)} off` : promo.message}
              </p>
            )}
          </div>
        )}

        {/* Tips */}
        {settings.tips.enabled && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
              Add a Tip
            </h3>
            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {settings.tips.show_no_tip && (
                <button
                  onClick={() => { onFormChange({ tip_amount: 0 }); setCustomTip('') }}
                  style={{
                    padding: '0.5rem 0.875rem',
                    borderRadius: '0.5rem',
                    border: `1.5px solid ${form.tip_amount === 0 && !customTip ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                    background: form.tip_amount === 0 && !customTip ? 'rgba(37,99,235,0.06)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                  }}
                >
                  No tip
                </button>
              )}
              {settings.tips.presets.map((pct) => {
                const tipVal = Math.round(discountedSubtotal * pct / 100 * 100) / 100
                return (
                  <button
                    key={pct}
                    onClick={() => handleTipSelect(pct)}
                    style={{
                      padding: '0.5rem 0.875rem',
                      borderRadius: '0.5rem',
                      border: `1.5px solid ${form.tip_amount === tipVal && !customTip ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                      background: form.tip_amount === tipVal && !customTip ? 'rgba(37,99,235,0.06)' : '#fff',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}
                  >
                    {pct}% ({formatCurrency(tipVal, currency)})
                  </button>
                )
              })}
              {settings.tips.allow_custom && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custom"
                  value={customTip}
                  onChange={(e) => handleCustomTip(e.target.value)}
                  style={{ ...inputStyle, width: '7rem', flex: 'unset' }}
                />
              )}
            </div>
          </div>
        )}

        {/* Order notes */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ margin: '0 0 0.625rem', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
            Order Notes (optional)
          </h3>
          <textarea
            value={form.notes}
            onChange={(e) => onFormChange({ notes: e.target.value })}
            placeholder="Any special requests for the whole order?"
            maxLength={1000}
            rows={2}
            style={{ ...inputStyle, resize: 'none' as const }}
            disabled={isSubmitting}
          />
        </div>

        {/* Marketing consent */}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', marginBottom: '1rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.marketing_consent}
            onChange={(e) => onFormChange({ marketing_consent: e.target.checked })}
            style={{ marginTop: '0.1rem', accentColor: 'var(--brand-primary, #2563eb)', flexShrink: 0 }}
            disabled={isSubmitting}
          />
          <span style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.4 }}>
            I agree to receive updates and promotions about my order.
          </span>
        </label>

        {/* Error */}
        {submitError && (
          <div style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            fontSize: '0.875rem',
            marginBottom: '1rem',
          }}>
            {submitError}
          </div>
        )}
      </div>

      {/* Order summary + submit */}
      <div style={{ padding: '0.875rem 1rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.875rem', fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Subtotal</span><span>{formatCurrency(subtotal, currency)}</span>
          </div>
          {promo?.valid && promo.discount_amount ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
              <span>Promo</span><span>−{formatCurrency(promo.discount_amount, currency)}</span>
            </div>
          ) : null}
          {settings.tax.enabled && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
              <span>Tax</span><span>{formatCurrency(taxAmount, currency)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Tip</span><span>{formatCurrency(tipAmount, currency)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', paddingTop: '0.375rem', borderTop: '1px solid #f3f4f6' }}>
            <span>Total</span><span>{formatCurrency(total, currency)}</span>
          </div>
        </div>

        {(() => {
          const cardNotReady = form.payment_method === 'card' && cardStatus !== 'ready' && !!settings.stripe_publishable_key
          const isDisabled = isSubmitting || !form.customer_name || !form.customer_email || cardNotReady
          const label = isSubmitting
            ? 'Placing Order…'
            : cardStatus === 'loading' && form.payment_method === 'card'
              ? 'Loading card form…'
              : `Place Order · ${formatCurrency(total, currency)}`
          return (
            <button
              onClick={onSubmit}
              disabled={isDisabled}
              style={{
                width: '100%',
                padding: '0.875rem',
                borderRadius: '0.75rem',
                border: 'none',
                background: isDisabled ? '#d1d5db' : 'var(--brand-primary, #2563eb)',
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              {label}
            </button>
          )
        })()}

        {!settings.features.remove_powered_by && (
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#d1d5db', margin: '0.625rem 0 0' }}>
            Powered by RestroAPI
          </p>
        )}
      </div>
    </div>
  )
}
