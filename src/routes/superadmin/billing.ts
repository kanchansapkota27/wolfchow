import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { KvCache } from '../../services/kv'

/** Expensive cross-tenant aggregate — cached briefly. */
const BILLING_SUMMARY_KEY = 'billing:summary'
const BILLING_SUMMARY_TTL = 300

/**
 * Superadmin commission/billing dashboards. Mounted under the `/superadmin/*`
 * guard stack (JWT → platform role → MFA). The aggregates run as SQL RPC
 * functions via the service-role client (RLS bypass, cross-tenant).
 */
export function registerBillingRoutes(app: Hono<HonoEnv>): void {
  app.get('/superadmin/billing', async (c) => {
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const cached = await cache.get<unknown[]>(BILLING_SUMMARY_KEY)
    if (cached) return c.json({ summary: cached, cached: true })

    const admin = createAdminClient(c.env)
    const { data, error } = await admin.rpc('superadmin_billing_summary')
    if (error) return c.json({ error: 'query_failed' }, 500)

    await cache.set(BILLING_SUMMARY_KEY, data, BILLING_SUMMARY_TTL)
    return c.json({ summary: data, cached: false })
  })

  app.get('/superadmin/billing/:restaurant_id', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin.rpc('superadmin_billing_monthly', {
      p_restaurant_id: c.req.param('restaurant_id'),
    })
    if (error) return c.json({ error: 'query_failed' }, 500)
    return c.json({ months: data })
  })
}
