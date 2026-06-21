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
}
