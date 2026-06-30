import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { registerPublicSettingsRoutes } from './settings'
import { registerPublicMenuRoutes } from './menu'
import { registerPublicOrderRoutes, type PublicOrderRouteDeps } from './orders'
import { registerPublicTrackingRoutes } from './tracking'
import { registerPublicPromoRoutes } from './promo'
import { registerPublicSlotsRoutes } from './slots'

export type PublicRouteDeps = PublicOrderRouteDeps

export function registerPublicRoutes(app: Hono<HonoEnv>, deps: PublicRouteDeps = {}): void {
  registerPublicSettingsRoutes(app)
  registerPublicMenuRoutes(app)
  registerPublicOrderRoutes(app, deps)
  registerPublicTrackingRoutes(app)
  registerPublicPromoRoutes(app)
  registerPublicSlotsRoutes(app)
}
