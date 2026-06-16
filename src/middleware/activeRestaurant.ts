import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types'
import { createAdminClient } from '../services/supabase'

/**
 * Reject requests from a suspended restaurant. Runs after `jwtMiddleware` on
 * tenant-scoped routes: looks up `restaurants.active` for the caller's
 * `restaurant_id` and returns `403 account_suspended` when the account is off.
 *
 * Platform roles (no `restaurant_id`) pass through untouched — this guard only
 * polices tenant sessions. Uses the service-role client so the lookup is not
 * itself subject to RLS.
 */
export function requireActiveRestaurant() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (!jwt.restaurant_id) {
      await next()
      return
    }

    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('restaurants')
      .select('active')
      .eq('id', jwt.restaurant_id)
      .maybeSingle()

    if (!data || (data as { active: boolean }).active === false) {
      return c.json({ error: 'account_suspended' }, 403)
    }
    await next()
  })
}
