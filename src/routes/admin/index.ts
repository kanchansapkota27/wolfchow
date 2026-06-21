import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { jwtMiddleware } from '../../middleware/jwt'
import { requireRestaurant, requireRole } from '../../middleware/guards'
import { registerRestaurantAdminRoutes, type RestaurantAdminDeps } from './restaurant'
import { registerCategoryRoutes, type CategoryRouteDeps } from './categories'
import { registerItemRoutes, type ItemRouteDeps } from './items'
import { registerModifierRoutes, type ModifierRouteDeps } from './modifiers'
import { registerHoursRoutes } from './hours'
import { registerClosureRoutes } from './closures'
import { registerSchedulingRoutes } from './scheduling'
import { registerPauseRoutes, type PauseRouteDeps } from './pause'
import { registerStaffRoutes } from './staff'
import { registerPaymentRoutes, type PaymentRouteDeps } from './payments'
import { registerSmtpRoutes, type SmtpRouteDeps } from './smtp'
import { registerNotificationRoutes, type NotificationRouteDeps } from './notifications'
import { registerTipsRoutes } from './tips'
import { registerAutomationRoutes } from './automation'
import { registerPromotionsRoutes } from './promotions'
import { registerNoticesRoutes, type NoticesRouteDeps } from './notices'
import { registerTransactionRoutes, type TransactionRouteDeps } from './transactions'

export interface AdminDeps extends RestaurantAdminDeps, CategoryRouteDeps, ItemRouteDeps, ModifierRouteDeps, PauseRouteDeps, PaymentRouteDeps, SmtpRouteDeps, NotificationRouteDeps, NoticesRouteDeps, TransactionRouteDeps {}

/**
 * Restaurant admin route group. Every `/admin/*` route sits behind:
 * - JWT verification
 * - A restaurant-scoped role (`restaurant_owner` or `kitchen`)
 * - A non-null restaurant_id claim
 *
 * `deps` is injectable for testing (e.g. swap out the R2 presigned URL generator).
 */
export function registerAdminRoutes(app: Hono<HonoEnv>, deps: AdminDeps = {}): void {
  app.use(
    '/admin/*',
    jwtMiddleware,
    requireRole('restaurant_owner', 'kitchen'),
    requireRestaurant(),
  )

  registerRestaurantAdminRoutes(app, deps)
  registerCategoryRoutes(app, deps)
  registerItemRoutes(app, deps)
  registerModifierRoutes(app, deps)
  registerHoursRoutes(app)
  registerClosureRoutes(app)
  registerSchedulingRoutes(app)
  registerPauseRoutes(app, deps)
  registerStaffRoutes(app)
  registerPaymentRoutes(app, deps)
  registerSmtpRoutes(app, deps)
  registerNotificationRoutes(app, deps)
  registerTipsRoutes(app)
  registerAutomationRoutes(app)
  registerPromotionsRoutes(app)
  registerNoticesRoutes(app, deps)
  registerTransactionRoutes(app, deps)
}
