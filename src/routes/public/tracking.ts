import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

export function registerPublicTrackingRoutes(app: Hono<HonoEnv>): void {
  app.get('/public/:slug/orders/:tracking_token', async (c) => {
    const slug = c.req.param('slug')
    const trackingToken = c.req.param('tracking_token')

    const rate = await c.env.RATE_LIMITER_TRACKING.limit({ key: `track:${trackingToken}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const admin = createAdminClient(c.env)

    // Read restaurant + its plan in one query, bypassing KV cache.
    // resolvePlan uses a 1-hour KV cache; if the plan changed after the cache
    // was written the feature flag check would produce a stale result.
    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id, base_prep_minutes, plan_id')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (!restaurant) {
      console.error('[tracking] restaurant_not_found slug=%s', slug)
      return c.json({ error: 'restaurant_not_found' }, 404)
    }

    const r = restaurant as Record<string, unknown>
    const restaurantId = r.id as string
    const planId = r.plan_id as string | null

    let flags: Record<string, boolean> | null = null
    if (planId) {
      const { data: planData } = await admin
        .from('plans')
        .select('feature_flags')
        .eq('id', planId)
        .maybeSingle()
      flags = (planData as Record<string, unknown> | null)?.feature_flags as Record<string, boolean> | null
    }

    if (!flags?.order_tracking_page) {
      console.error('[tracking] feature_not_available plan_id=%s flags=%s', planId, JSON.stringify(flags))
      return c.json({ error: 'feature_not_available' }, 404)
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .select('id, tracking_token, status, payment_method, total, subtotal, tax_amount, promo_discount, tip_amount, created_at, scheduled_for, customer_name')
      .eq('tracking_token', trackingToken)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (!order) {
      console.error('[tracking] order_not_found token=%s restaurant=%s db_error=%s', trackingToken, restaurantId, orderError?.message)
      return c.json({ error: 'order_not_found' }, 404)
    }

    const or = order as Record<string, unknown>

    // Load order items (no price info leaked beyond what's already been paid)
    const { data: items } = await admin
      .from('order_items')
      .select('id, item_id, item_name, variant_name, quantity, unit_price, modifiers, notes')
      .eq('order_id', or.id as string)

    // Estimate ready time based on created_at + prep_minutes
    const prepMinutes = r.base_prep_minutes as number ?? 20
    const createdAt = new Date(or.created_at as string)
    const estimatedReady = new Date(createdAt.getTime() + prepMinutes * 60 * 1000)

    return c.json({
      order_id: or.id as string,
      tracking_token: trackingToken,
      status: or.status as string,
      payment_method: or.payment_method as string,
      customer_name: or.customer_name as string,
      subtotal: Number(or.subtotal),
      promo_discount: Number(or.promo_discount),
      tax_amount: Number(or.tax_amount),
      tip_amount: Number(or.tip_amount),
      total: Number(or.total),
      created_at: or.created_at as string,
      scheduled_for: or.scheduled_for as string | null,
      estimated_ready: estimatedReady.toISOString(),
      items: (items ?? []).map((item) => {
        const ir = item as Record<string, unknown>
        return {
          id: ir.id as string,
          item_name: ir.item_name as string | null,
          variant_name: ir.variant_name as string | null,
          quantity: ir.quantity as number,
          unit_price: Number(ir.unit_price),
          modifiers: ir.modifiers as Array<{ name: string; price_delta: number }>,
          notes: ir.notes as string | null,
        }
      }),
    })
  })
}
