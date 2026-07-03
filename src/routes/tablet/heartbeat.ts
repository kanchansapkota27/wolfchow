import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

export function registerHeartbeatRoute(app: Hono<HonoEnv>): void {
  app.post('/tablet/heartbeat', async (c) => {
    const jwt = c.get('jwt')
    const deviceId = jwt.device_id
    const restaurantId = jwt.restaurant_id!

    // Only device sessions (tablet_device role) have a device_id
    if (!deviceId) return c.body(null, 204)

    // Fire-and-forget — heartbeat failure must never surface to the tablet
    const admin = createAdminClient(c.env)
    void admin
      .from('devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', deviceId)
      .eq('restaurant_id', restaurantId)
      .is('revoked_at', null)

    return c.body(null, 204)
  })
}
