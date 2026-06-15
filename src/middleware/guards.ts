import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../types'

/**
 * Permission guards. All run *after* `jwtMiddleware` and read the verified
 * claims from `c.get('jwt')`. Error responses use the standard `{ error, code? }`
 * shape. If the guard runs without prior auth (no claims), it returns 401.
 */

/** Allow only the listed roles, else 403. */
export function requireRole(...roles: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (!roles.includes(jwt.role)) {
      return c.json({ error: 'forbidden', code: 'insufficient_role' }, 403)
    }
    await next()
  })
}

/** Require a specific fine-grained permission, else 403. */
export function requirePermission(permission: string) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (!jwt.permissions.includes(permission)) {
      return c.json({ error: 'forbidden', code: 'insufficient_permission' }, 403)
    }
    await next()
  })
}

/**
 * Require a tenant context, else 400. Prevents platform roles (superadmin /
 * support) with a null `restaurant_id` from accidentally hitting tenant routes.
 */
export function requireRestaurant() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (!jwt.restaurant_id) {
      return c.json({ error: 'restaurant_required', code: 'no_restaurant_context' }, 400)
    }
    await next()
  })
}

/**
 * Block sensitive actions (billing changes, API key rotation, …) while a
 * superadmin is impersonating a tenant. `blockedActions` labels what this guard
 * protects; any of them is disallowed when `jwt.imp === true`.
 */
export function requireNotImpersonating(...blockedActions: string[]) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (jwt.imp) {
      return c.json(
        { error: 'forbidden', code: 'impersonation_blocked', blocked: blockedActions },
        403,
      )
    }
    await next()
  })
}
