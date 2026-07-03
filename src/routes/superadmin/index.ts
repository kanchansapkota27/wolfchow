import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { jwtMiddleware } from '../../middleware/jwt'
import { requireMFA, requireRole } from '../../middleware/guards'
import { registerPlanRoutes } from './plans'
import { registerInviteRoutes } from './invites'
import { registerImpersonateRoutes } from './impersonate'
import { registerRestaurantRoutes, type RestaurantRouteDeps } from './restaurants'
import { registerSmtpRoutes, type SmtpRouteDeps } from './smtp'
import { registerBillingRoutes } from './billing'
import { registerAuditRoutes } from './audit'
import { registerSettingsRoutes } from './settings'

/**
 * Superadmin (and support) route group. Every `/superadmin/*` route sits behind
 * the same stack: a verified JWT, a platform role (`superadmin`/`support`, so
 * tenant users get 403), and MFA (`requireMFA`, so the session must carry a TOTP
 * factor). Later Slice 1 stories register their handlers on this group; this
 * story establishes the mount point and a session probe.
 *
 * `deps` forwards injectable dependencies (e.g. a fake Realtime broadcaster) to
 * the resource routers for testing.
 */
export interface SuperadminDeps extends RestaurantRouteDeps, SmtpRouteDeps {}

export function registerSuperadminRoutes(
  app: Hono<HonoEnv>,
  deps: SuperadminDeps = {},
): void {
  app.use('/superadmin/*', jwtMiddleware, requireRole('superadmin', 'support'), requireMFA())

  // Lightweight probe: confirms the guard stack passed and echoes the identity.
  app.get('/superadmin/session', (c) => {
    const jwt = c.get('jwt')
    return c.json({
      sub: jwt.sub,
      role: jwt.role,
      restaurant_id: jwt.restaurant_id,
      mfa: true,
    })
  })

  // Resource routers (registered after the guard `use` so they inherit it).
  registerPlanRoutes(app)
  registerInviteRoutes(app)
  registerImpersonateRoutes(app)
  registerRestaurantRoutes(app, deps)
  registerSmtpRoutes(app, deps)
  registerBillingRoutes(app)
  registerAuditRoutes(app)
  registerSettingsRoutes(app)
}
