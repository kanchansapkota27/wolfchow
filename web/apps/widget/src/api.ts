import type {
  WidgetSettings,
  PublicMenuCategory,
  CreateOrderResult,
  CheckoutForm,
  CartItem,
  PromoValidation,
  OrderTrackingResult,
} from './types'

export class WidgetApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message?: string,
  ) {
    super(message ?? `API error ${status}`)
  }
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : undefined
  if (!res.ok) throw new WidgetApiError(res.status, body)
  return body as T
}

export function createWidgetApi(apiBase: string, slug: string) {
  const base = `${apiBase}/public/${encodeURIComponent(slug)}`

  return {
    getSettings: () => apiFetch<WidgetSettings>(`${base}/settings`),

    getSlots: () =>
      apiFetch<{ slots: string[] }>(`${base}/slots`).then((r) => r.slots),

    getMenu: () =>
      apiFetch<{ categories: PublicMenuCategory[] }>(`${base}/menu`).then((r) => r.categories),

    validatePromo: (code: string, subtotal: number) =>
      apiFetch<PromoValidation>(`${base}/promo/validate`, {
        method: 'POST',
        body: JSON.stringify({ code, subtotal }),
      }),

    createOrder: (form: CheckoutForm, items: CartItem[], promoId?: string): Promise<CreateOrderResult> => {
      const orderItems = items.map((item) => ({
        item_id: item.item_id,
        variant_id: item.variant_id ?? undefined,
        quantity: item.quantity,
        modifiers: item.modifiers.map((m) => ({ group_id: m.group_id, option_id: m.option_id })),
        notes: item.notes || undefined,
      }))

      return apiFetch<CreateOrderResult>(`${base}/orders`, {
        method: 'POST',
        body: JSON.stringify({
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone || undefined,
          payment_method: form.payment_method,
          scheduled_for: form.scheduled_for || undefined,
          items: orderItems,
          promo_id: promoId,
          promo_code: form.promo_code || undefined,
          tip_amount: form.tip_amount,
          notes: form.notes || undefined,
          marketing_consent: form.marketing_consent,
        }),
      })
    },

    confirmOrder: (orderId: string, paymentIntentId: string) =>
      apiFetch<{ order_id: string; tracking_token: string; status: string }>(
        `${base}/orders/${orderId}/confirm`,
        { method: 'POST', body: JSON.stringify({ payment_intent_id: paymentIntentId }) },
      ),

    getOrderTracking: (trackingToken: string) =>
      apiFetch<OrderTrackingResult>(`${base}/orders/${encodeURIComponent(trackingToken)}`),
  }
}

export type WidgetApi = ReturnType<typeof createWidgetApi>
