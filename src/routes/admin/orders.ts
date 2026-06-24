import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

const ACTIVE_STATUSES = ['auth_success', 'accepted', 'preparing', 'ready'] as const

export function registerAdminOrderRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/orders/active ───────────────────────────────────────────────
  // Returns all in-flight orders for the live feed on the admin Orders page.
  // Separate from the tablet endpoint which requires device auth.

  app.get('/admin/orders/active', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('orders')
      .select('*, order_items(*)')
      .eq('restaurant_id', restaurantId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ orders: data ?? [] })
  })
}
