import type { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { EncryptionService } from '../../services/encryption'
import { StripeService } from '../../services/stripe'
import type { Broadcaster } from '../../services/realtime'
import type { NotificationService } from '../../services/notifications'

// ── Active order statuses ─────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['auth_success', 'accepted', 'preparing', 'ready'] as const

// ── Helper ─────────────────────────────────────────────────────────────────────

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Deps ──────────────────────────────────────────────────────────────────────

export interface OrderRouteDeps {
  broadcaster?: Broadcaster
  stripeCapture?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
  stripeCancel?: (secretKey: string, intentId: string, orderId: string) => Promise<void>
  notifier?: (env: Env) => NotificationService
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerOrderRoutes(app: Hono<HonoEnv>, deps: OrderRouteDeps = {}): void {
  // ── GET /tablet/orders ─────────────────────────────────────────────────────

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

  // ── GET /tablet/orders/:id ─────────────────────────────────────────────────

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

  // ── POST /tablet/orders/:id/accept ─────────────────────────────────────────

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

    // Stripe capture for card payments
    if (order.payment_method === 'card' && order.stripe_intent_id) {
      try {
        if (deps.stripeCapture) {
          await deps.stripeCapture('', order.stripe_intent_id, orderId)
        } else {
          const { data: payConf } = await admin
            .from('payment_config')
            .select('encrypted_stripe_secret')
            .eq('restaurant_id', restaurantId)
            .single()

          if (!payConf?.encrypted_stripe_secret) {
            return c.json({ error: 'stripe_not_configured' }, 500)
          }

          const enc = new EncryptionService(c.env.MASTER_ENCRYPTION_KEY)
          const secretKey = await enc.open(payConf.encrypted_stripe_secret, restaurantId)
          const stripe = new StripeService(secretKey)
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
      void deps.notifier(c.env).sendOrderAccepted(restaurantId, {
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
      })
    }

    return c.json(updated)
  })

  // ── POST /tablet/orders/:id/reject ─────────────────────────────────────────

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

    // Stripe cancel for card payments
    if (order.payment_method === 'card' && order.stripe_intent_id) {
      try {
        if (deps.stripeCancel) {
          await deps.stripeCancel('', order.stripe_intent_id, orderId)
        } else {
          const { data: payConf } = await admin
            .from('payment_config')
            .select('encrypted_stripe_secret')
            .eq('restaurant_id', restaurantId)
            .single()

          if (payConf?.encrypted_stripe_secret) {
            const enc = new EncryptionService(c.env.MASTER_ENCRYPTION_KEY)
            const secretKey = await enc.open(payConf.encrypted_stripe_secret, restaurantId)
            const stripe = new StripeService(secretKey)
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
      void deps.notifier(c.env).sendOrderRejected(restaurantId, {
        id: orderId,
        tracking_token: u.tracking_token as string,
        customer_name: u.customer_name as string,
        customer_email: u.customer_email as string,
        total: u.total as number,
        payment_method: u.payment_method as string,
        notes: (u.notes as string | null) ?? null,
        scheduled_for: (u.scheduled_for as string | null) ?? null,
      }, reason)
    }

    return c.json(updated)
  })
}
