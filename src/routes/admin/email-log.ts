import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

export function registerEmailLogRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/email-log ───────────────────────────────────────────────────
  // Returns the 50 most recent email attempts (sent + failed) for this restaurant.
  // Use this to diagnose why emails are not being delivered.

  app.get('/admin/email-log', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('email_log')
      .select('id, to_address, subject, smtp_source, status, failure_reason, sent_at')
      .eq('restaurant_id', restaurantId)
      .order('sent_at', { ascending: false })
      .limit(50)

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ logs: data ?? [] })
  })
}
