import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { jwtMiddleware } from '../../middleware/jwt'
import { requireActiveRestaurant, requireRestaurant, requireRole } from '../../middleware/guards'
import { registerSessionRoutes } from './session'
import { registerOrderRoutes, type OrderRouteDeps } from './orders'
import { registerStatusRoutes, type StatusRouteDeps } from './status'
import { registerInventoryRoutes, type InventoryRouteDeps } from './inventory'
import { registerPauseRoutes, type PauseRouteDeps } from './pause'
import { registerHeartbeatRoute } from './heartbeat'

export interface TabletDeps extends OrderRouteDeps, StatusRouteDeps, InventoryRouteDeps, PauseRouteDeps {}
// Note: notifier is declared on both OrderRouteDeps and StatusRouteDeps
// with the same type, so the intersection resolves correctly.

/**
 * Kitchen tablet route group. Every /tablet/* route sits behind:
 * - JWT verification
 * - kitchen or tablet_device role
 * - non-null restaurant_id claim
 * - the restaurant not being suspended (STORY-083)
 */
export function registerTabletRoutes(app: Hono<HonoEnv>, deps: TabletDeps = {}): void {
  app.use(
    '/tablet/*',
    jwtMiddleware,
    requireRole('tablet_device', 'kitchen'),
    requireRestaurant(),
    requireActiveRestaurant(),
  )

  registerSessionRoutes(app)
  registerOrderRoutes(app, deps)
  registerStatusRoutes(app, deps)
  registerInventoryRoutes(app, deps)
  registerPauseRoutes(app, deps)
  registerHeartbeatRoute(app)
}
