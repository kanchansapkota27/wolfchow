import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import { EncryptionService } from '../../services/encryption'

const DEFAULT_HISTORY_DAYS = 30
const PAGE_SIZE = 50

export interface TransactionRouteDeps {
  refundStripePayment?: (secretKey: string, paymentIntentId: string, amountCents?: number) => Promise<{ id: string }>
  openStripeKey?: (sealed: string, restaurantId: string) => Promise<string>
}

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

const refundSchema = z.object({
  amount_cents: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
})

export function registerTransactionRoutes(app: Hono<HonoEnv>, deps: TransactionRouteDeps = {}): void {
  // ── GET /admin/transactions ────────────────────────────────────────────────

  app.get('/admin/transactions', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const historyDays = (plan?.history_days as number | undefined) ?? DEFAULT_HISTORY_DAYS

    const pageParam = c.req.query('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const since = new Date(Date.now() - historyDays * 86_400_000).toISOString()

    const admin = createAdminClient(c.env)
    const { data, error, count } = await admin
      .from('orders')
      .select('id, status, total, stripe_intent_id, created_at, customer_name, customer_email, refund_id, refunded_at', { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({
      transactions: data ?? [],
      total: count ?? 0,
      page,
      page_size: PAGE_SIZE,
      history_days: historyDays,
    })
  })

  // ── GET /admin/transactions/:order_id ─────────────────────────────────────

  app.get('/admin/transactions/:order_id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('order_id')
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

  // ── POST /admin/transactions/:order_id/refund ──────────────────────────────

  app.post('/admin/transactions/:order_id/refund', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('order_id')

    const parsed = refundSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    const { data: order } = await admin
      .from('orders')
      .select('id, status, total_cents, payment_intent_id, refund_id, payment_method')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!order) return c.json({ error: 'not_found' }, 404)

    const o = order as {
      status: string
      payment_intent_id: string | null
      refund_id: string | null
      payment_method: string
      total_cents: number
    }

    if (o.refund_id) return c.json({ error: 'already_refunded' }, 409)
    if (!['completed', 'missed', 'rejected'].includes(o.status)) {
      return c.json({ error: 'order_not_refundable', status: o.status }, 422)
    }
    if (!o.payment_intent_id) {
      return c.json({ error: 'no_payment_intent' }, 422)
    }

    // Fetch sealed Stripe key for this restaurant
    const { data: payConfig } = await admin
      .from('payment_config')
      .select('stripe_secret_key_sealed')
      .eq('restaurant_id', restaurantId)
      .single()

    if (!payConfig || !(payConfig as { stripe_secret_key_sealed: string | null }).stripe_secret_key_sealed) {
      return c.json({ error: 'stripe_not_configured' }, 422)
    }

    const sealed = (payConfig as { stripe_secret_key_sealed: string }).stripe_secret_key_sealed
    const openKey = deps.openStripeKey
      ? await deps.openStripeKey(sealed, restaurantId)
      : await new EncryptionService(c.env.MASTER_ENCRYPTION_KEY).open(sealed, restaurantId)

    const doRefund = deps.refundStripePayment
      ? deps.refundStripePayment
      : async (sk: string, piId: string, amountCents?: number) => {
          const body = new URLSearchParams({ payment_intent: piId })
          if (amountCents) body.set('amount', String(amountCents))
          const resp = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          })
          if (!resp.ok) {
            const err = await resp.json() as { error?: { message?: string } }
            throw new Error(err.error?.message ?? 'stripe_refund_failed')
          }
          return resp.json() as Promise<{ id: string }>
        }

    let refund: { id: string }
    try {
      refund = await doRefund(openKey, o.payment_intent_id, parsed.data.amount_cents)
    } catch (err) {
      return c.json({ error: 'refund_failed', detail: (err as Error).message }, 502)
    }

    const { data: updated, error: updateErr } = await admin
      .from('orders')
      .update({ status: 'refunded', refund_id: refund.id, refunded_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single()

    if (updateErr || !updated) return c.json({ error: 'status_update_failed' }, 500)

    return c.json(updated)
  })
}
