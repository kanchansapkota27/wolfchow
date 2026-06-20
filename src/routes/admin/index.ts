import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { jwtMiddleware } from '../../middleware/jwt'
import { requireRestaurant, requireRole } from '../../middleware/guards'
import { registerRestaurantAdminRoutes, type RestaurantAdminDeps } from './restaurant'
import { registerCategoryRoutes, type CategoryRouteDeps } from './categories'

export interface AdminDeps extends RestaurantAdminDeps, CategoryRouteDeps {}

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
}
