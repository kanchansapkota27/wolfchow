const STRIPE_BASE = 'https://api.stripe.com/v1'

export interface StripeCaptureResult {
  id: string
  status: string
  amount_received: number
}

export interface StripeCancelResult {
  id: string
  status: string
}

/** Thin wrapper over Stripe's REST API — keeps all Stripe calls out of route handlers. */
export class StripeService {
  constructor(private readonly secretKey: string) {}

  async capturePaymentIntent(intentId: string, idempotencyKey: string): Promise<StripeCaptureResult> {
    const res = await fetch(`${STRIPE_BASE}/payment_intents/${intentId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Stripe capture failed ${res.status}: ${body}`)
    }
    return res.json() as Promise<StripeCaptureResult>
  }

  async cancelPaymentIntent(intentId: string, idempotencyKey: string): Promise<StripeCancelResult> {
    const res = await fetch(`${STRIPE_BASE}/payment_intents/${intentId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Stripe cancel failed ${res.status}: ${body}`)
    }
    return res.json() as Promise<StripeCancelResult>
  }

  async createPaymentIntent(
    amountCents: number,
    currency: string,
    restaurantId: string,
    orderId: string,
  ): Promise<{ id: string; client_secret: string }> {
    const body = new URLSearchParams({
      amount: String(amountCents),
      currency: currency.toLowerCase(),
      capture_method: 'manual',
      'metadata[restaurant_id]': restaurantId,
      'metadata[order_id]': orderId,
    })
    const res = await fetch(`${STRIPE_BASE}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Stripe create PaymentIntent failed ${res.status}: ${err}`)
    }
    return res.json() as Promise<{ id: string; client_secret: string }>
  }

  async fetchPaymentIntentStatus(intentId: string): Promise<{ status: string; amount: number }> {
    const res = await fetch(`${STRIPE_BASE}/payment_intents/${intentId}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    })
    if (!res.ok) throw new Error(`Stripe fetch failed ${res.status}`)
    return res.json() as Promise<{ status: string; amount: number }>
  }

  async refundPaymentIntent(intentId: string, amountCents?: number): Promise<{ id: string }> {
    const body = new URLSearchParams({ payment_intent: intentId })
    if (amountCents) body.set('amount', String(amountCents))
    const res = await fetch(`${STRIPE_BASE}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } }
      throw new Error(err.error?.message ?? 'stripe_refund_failed')
    }
    return res.json() as Promise<{ id: string }>
  }
}
