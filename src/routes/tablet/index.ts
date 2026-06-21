import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { jwtMiddleware } from '../../middleware/jwt'
import { requireRestaurant, requireRole } from '../../middleware/guards'
import { registerSessionRoutes } from './session'
import { registerOrderRoutes, type OrderRouteDeps } from './orders'
import { registerStatusRoutes, type StatusRouteDeps } from './status'
import { registerInventoryRoutes, type InventoryRouteDeps } from './inventory'

export interface TabletDeps extends OrderRouteDeps, StatusRouteDeps, InventoryRouteDeps {}

/**
 * Kitchen tablet route group. Every /tablet/* route sits behind:
 * - JWT verification
 * - kitchen or tablet_device role
 * - non-null restaurant_id claim
 */
export function registerTabletRoutes(app: Hono<HonoEnv>, deps: TabletDeps = {}): void {
  app.use('/tablet/*', jwtMiddleware, requireRole('kitchen', 'tablet_device'), requireRestaurant())

  registerSessionRoutes(app)
  registerOrderRoutes(app, deps)
  registerStatusRoutes(app, deps)
  registerInventoryRoutes(app, deps)
}
