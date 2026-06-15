import type { Hono } from 'hono'
import type { HonoEnv } from '../types'

/**
 * Liveness probe. Intentionally dependency-free so it answers even when
 * downstream services (Supabase, Stripe) are degraded.
 */
export function registerHealthRoutes(app: Hono<HonoEnv>): void {
  app.get('/health', (c) =>
    c.json({ status: 'ok', timestamp: new Date().toISOString() }),
  )
}
