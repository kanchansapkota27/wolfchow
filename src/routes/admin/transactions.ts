import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import { getStripeClient } from '../../services/secrets'

const DEFAULT_HISTORY_DAYS = 30
const PAGE_SIZE = 50

export interface TransactionRouteDeps {
  refundStripePayment?: (paymentIntentId: string, amountCents?: number) => Promise<{ id: string }>
}

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

const refundSchema = z.object({
  amount_cents: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
})

export function registerTransactionRoutes(app: Hono<HonoEnv>, deps: TransactionRouteDeps = {}): void {
  app.get('/admin/transactions', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const historyDays = (plan?.transaction_history_days as number | undefined) ?? DEFAULT_HISTORY_DAYS

    const pageParam = c.req.query('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const since = new Date(Date.now() - historyDays * 86_400_000).toISOString()

    const admin = createAdminClient(c.env)
    const { data, error, count } = await admin
      .from('orders')
      .select('*, items:order_items(*)', { count: 'exact' })
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

  app.get('/admin/transactions/:order_id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('order_id')
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('id, status, total, subtotal, tax_amount, tip_amount, promo_discount, stripe_intent_id, created_at, customer_name, customer_email, customer_phone, refund_id, refunded_at, payment_method, notes, scheduled_for')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

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
      .select('id, status, total, stripe_intent_id, refund_id, payment_method')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!order) return c.json({ error: 'not_found' }, 404)

    const o = order as {
      status: string
      stripe_intent_id: string | null
      refund_id: string | null
      payment_method: string
      total: number
    }

    if (o.refund_id) return c.json({ error: 'already_refunded' }, 409)
    if (!['completed', 'missed', 'rejected'].includes(o.status)) {
      return c.json({ error: 'order_not_refundable', status: o.status }, 422)
    }
    if (!o.stripe_intent_id) {
      return c.json({ error: 'no_payment_intent' }, 422)
    }

    let refund: { id: string }
    try {
      if (deps.refundStripePayment) {
        refund = await deps.refundStripePayment(o.stripe_intent_id, parsed.data.amount_cents)
      } else {
        const stripe = await getStripeClient(restaurantId, c.env)
        if (!stripe) return c.json({ error: 'stripe_not_configured' }, 422)
        refund = await stripe.refundPaymentIntent(o.stripe_intent_id, parsed.data.amount_cents)
      }
    } catch (err) {
      return c.json({ error: 'refund_failed', detail: (err as Error).message }, 502)
    }

    const { data: updated, error: updateErr } = await admin
      .from('orders')
      .update({ status: 'refunded', refund_id: refund.id, refunded_at: new Date().toISOString() })
      .eq('id', orderId)
      .is('refund_id', null)
      .select('id, status, refund_id, refunded_at, total, payment_method')
      .single()

    if (updateErr || !updated) return c.json({ error: 'already_refunded' }, 409)

    return c.json(updated)
  })
}
