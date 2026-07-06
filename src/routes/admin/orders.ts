import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { getStripeClient } from '../../services/secrets'
import type { Broadcaster } from '../../services/realtime'

const ACTIVE_STATUSES = ['auth_success', 'accepted', 'preparing', 'ready'] as const

export interface AdminOrderRouteDeps {
  broadcaster?: Broadcaster
  stripeCapture?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
  stripeCancel?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
}

export function registerAdminOrderRoutes(app: Hono<HonoEnv>, deps: AdminOrderRouteDeps = {}): void {
  app.get('/admin/orders/active', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('restaurant_id', restaurantId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ orders: data ?? [] })
  })

  app.post('/admin/orders/:id/accept', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('id')
    const admin = createAdminClient(c.env)

    const { data: order, error: fetchErr } = await admin
      .from('orders')
      .select('id, status, payment_method, stripe_intent_id')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (fetchErr || !order) return c.json({ error: 'not_found' }, 404)
    if (order.status === 'accepted') return c.json({ error: 'order_already_accepted' }, 409)
    if (order.status !== 'auth_success') {
      return c.json({ error: 'invalid_status', current: order.status }, 422)
    }

    if (order.payment_method === 'card' && order.stripe_intent_id) {
      try {
        if (deps.stripeCapture) {
          await deps.stripeCapture('', order.stripe_intent_id, orderId)
        } else {
          const stripe = await getStripeClient(restaurantId, c.env)
          if (!stripe) return c.json({ error: 'stripe_not_configured' }, 500)
          await stripe.capturePaymentIntent(order.stripe_intent_id, `capture_${orderId}`)
        }
      } catch (err) {
        return c.json({ error: 'stripe_capture_failed', message: String(err) }, 502)
      }
    }

    const { data: updated, error: updateErr } = await admin
      .from('orders')
      .update({
        status: 'accepted',
        payment_status: order.payment_method === 'card' ? 'captured' : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*, items:order_items(*)')
      .single()

    if (updateErr || !updated) return c.json({ error: 'update_failed' }, 500)

    deps.broadcaster?.broadcast(
      restaurantId,
      'order_accepted',
      { order_id: orderId },
      {} as ExecutionContext,
    )

    return c.json(updated)
  })

  app.post('/admin/orders/:id/reject', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('id')

    let rawBody: Record<string, unknown> | null = null
    try { rawBody = await c.req.json() as Record<string, unknown> } catch { /* no body */ }
    const reason = typeof rawBody?.reason === 'string' ? rawBody.reason.slice(0, 500) : null

    const admin = createAdminClient(c.env)

    const { data: order, error: fetchErr } = await admin
      .from('orders')
      .select('id, status, payment_method, stripe_intent_id')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (fetchErr || !order) return c.json({ error: 'not_found' }, 404)
    if (!['auth_success', 'accepted'].includes(order.status)) {
      return c.json({ error: 'invalid_status', current: order.status }, 422)
    }

    if (order.payment_method === 'card' && order.stripe_intent_id) {
      try {
        if (deps.stripeCancel) {
          await deps.stripeCancel('', order.stripe_intent_id, orderId)
        } else {
          const stripe = await getStripeClient(restaurantId, c.env)
          if (stripe) {
            await stripe.cancelPaymentIntent(order.stripe_intent_id, `cancel_${orderId}`)
          }
        }
      } catch {
        // Cancel failure does not block status update
      }
    }

    const { data: updated, error: updateErr } = await admin
      .from('orders')
      .update({
        status: 'rejected',
        payment_status: order.payment_method === 'card' ? 'cancelled' : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('*, items:order_items(*)')
      .single()

    if (updateErr || !updated) return c.json({ error: 'update_failed' }, 500)

    deps.broadcaster?.broadcast(
      restaurantId,
      'order_rejected',
      { order_id: orderId },
      {} as ExecutionContext,
    )

    // reason variable declared above, suppress unused warning
    void reason

    return c.json(updated)
  })
}
