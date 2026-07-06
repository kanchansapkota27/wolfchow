import type { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { getStripeClient } from '../../services/secrets'
import type { Broadcaster } from '../../services/realtime'
import type { NotificationService } from '../../services/notifications'
import { resolvePlan } from '../../services/plan'

const ACTIVE_STATUSES = ['auth_success', 'accepted', 'preparing', 'ready'] as const

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface OrderRouteDeps {
  broadcaster?: Broadcaster
  stripeCapture?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
  stripeCancel?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
  notifier?: (env: Env) => NotificationService
}

export function registerOrderRoutes(app: Hono<HonoEnv>, deps: OrderRouteDeps = {}): void {
  app.get('/tablet/orders', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('restaurant_id', restaurantId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)
    return c.json({ orders: data ?? [] })
  })

  app.get('/tablet/orders/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const orderId = c.req.param('id')
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

  app.post('/tablet/orders/:id/accept', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('orders:accept_reject')) {
      return c.json({ error: 'forbidden', required_permission: 'orders:accept_reject' }, 403)
    }

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

    if (deps.notifier) {
      const u = updated as Record<string, unknown>
      c.executionCtx.waitUntil(deps.notifier(c.env).sendOrderAccepted(restaurantId, {
        id: orderId,
        tracking_token: u.tracking_token as string,
        customer_name: u.customer_name as string,
        customer_email: u.customer_email as string,
        total: u.total as number,
        payment_method: u.payment_method as string,
        items: (u.items as Array<Record<string, unknown>> | undefined)?.map((i) => ({
          item_name: i.item_name as string | null,
          variant_name: i.variant_name as string | null,
          quantity: i.quantity as number,
          unit_price: i.unit_price as number,
          modifiers: (i.modifiers as Array<{ name: string; price_delta: number }>) ?? [],
          notes: i.notes as string | null,
        })),
        notes: (u.notes as string | null) ?? null,
        scheduled_for: (u.scheduled_for as string | null) ?? null,
      }))
    }

    return c.json(updated)
  })

  app.post('/tablet/orders/:id/reject', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('orders:accept_reject')) {
      return c.json({ error: 'forbidden', required_permission: 'orders:accept_reject' }, 403)
    }

    const orderId = c.req.param('id')

    const rawBody = await parseBody(c.req.raw) as Record<string, unknown> | null
    const reason = typeof rawBody?.reason === 'string'
      ? rawBody.reason.slice(0, 500)
      : null

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
        // Cancel failure is logged but does not block status update
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

    if (deps.notifier) {
      const u = updated as Record<string, unknown>
      c.executionCtx.waitUntil(deps.notifier(c.env).sendOrderRejected(restaurantId, {
        id: orderId,
        tracking_token: u.tracking_token as string,
        customer_name: u.customer_name as string,
        customer_email: u.customer_email as string,
        total: u.total as number,
        payment_method: u.payment_method as string,
        notes: (u.notes as string | null) ?? null,
        scheduled_for: (u.scheduled_for as string | null) ?? null,
      }, reason))
    }

    return c.json(updated)
  })

  app.get('/tablet/orders/history', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const plan = await resolvePlan(c.env, restaurantId)
    const historyDays = (plan?.transaction_history_days as number | null) ?? 30
    const since = new Date(Date.now() - historyDays * 86_400_000).toISOString()

    const pageParam = c.req.query('page')
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1
    const pageSize = 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await admin
      .from('orders')
      .select('id, status, total, payment_method, customer_name, created_at, updated_at, items:order_items(item_name, variant_name, quantity)', { count: 'exact' })
      .eq('restaurant_id', restaurantId)
      .in('status', ['completed', 'rejected', 'missed'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({
      orders: data ?? [],
      total: count ?? 0,
      page,
      page_size: pageSize,
      history_days: historyDays,
    })
  })
}
