import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { signJwt } from '../../services/tokens'

/** Impersonation sessions are deliberately short-lived. */
const IMPERSONATION_TTL_SECONDS = 30 * 60

/**
 * Impersonation: a superadmin/support user temporarily acts as a restaurant
 * owner. Mounted under the `/superadmin/*` guard stack (JWT → platform role →
 * MFA), so the caller is already an authenticated superadmin/support; tenant
 * roles never reach here (403 from `requireRole`).
 *
 * The minted token carries `imp: true` and `imp_by`, which `requireNotImpersonating`
 * uses to block sensitive actions (Stripe key, payment methods, device rotation)
 * on the Slice-2 admin routes. Every start is written to `audit_log`.
 */
export function registerImpersonateRoutes(app: Hono<HonoEnv>): void {
  app.post('/superadmin/restaurants/:id/impersonate', async (c) => {
    const restaurantId = c.req.param('id')
    const caller = c.get('jwt')
    const admin = createAdminClient(c.env)

    const restaurant = await admin
      .from('restaurants')
      .select('id, slug, display_name')
      .eq('id', restaurantId)
      .maybeSingle()
    const row = restaurant.data as { id: string; slug: string; display_name: string } | null
    if (!row) return c.json({ error: 'restaurant_not_found' }, 404)

    const now = Math.floor(Date.now() / 1000)
    const accessToken = await signJwt(
      {
        sub: caller.sub,
        role: 'restaurant_owner',
        restaurant_id: row.id,
        slug: row.slug,
        permissions: [],
        imp: true,
        imp_by: caller.sub,
        aud: 'authenticated',
        iat: now,
        exp: now + IMPERSONATION_TTL_SECONDS,
      },
      c.env.SUPABASE_JWT_SECRET,
    )

    await admin.from('audit_log').insert({
      restaurant_id: row.id,
      table_name: 'restaurants',
      operation: 'IMPERSONATION_START',
      user_id: caller.sub,
      new_data: { target_restaurant_id: row.id },
      ip_address: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? null,
    })

    return c.json({
      access_token: accessToken,
      expires_in: IMPERSONATION_TTL_SECONDS,
      restaurant_name: row.display_name,
    })
  })
}
