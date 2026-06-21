import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

export function registerSessionRoutes(app: Hono<HonoEnv>): void {
  // ── GET /tablet/session ────────────────────────────────────────────────────
  // Returns identity from JWT claims + restaurant pause state.
  // Used by the tablet PWA to confirm login on app load.
  app.get('/tablet/session', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('restaurants')
      .select('orders_paused, pause_mode, pause_until, pause_reason, pause_scheduled_orders')
      .eq('id', restaurantId)
      .single()

    return c.json({
      identity: {
        sub: jwt.sub,
        role: jwt.role,
        restaurant_id: restaurantId,
        device_id: jwt.device_id,
        permissions: jwt.permissions,
      },
      pause_state: data ?? null,
    })
  })
}
