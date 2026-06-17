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
 * Require multi-factor auth on the session. Reads the Supabase `amr` claim and
 * passes only when a `totp` factor is present; otherwise 403 `mfa_required`.
 * Applied to the whole `/superadmin/*` group so platform management always sits
 * behind a second factor. TOTP enrollment is handled in Supabase Auth (client
 * MFA enroll/verify); see the STORY-005 docs.
 *
 * LOCAL DEV ONLY: when `MFA_DEV_BYPASS === 'true'` the TOTP check is skipped, so
 * a seeded superadmin can use the panel before the MFA enroll/challenge flow
 * exists. This var lives only in `.dev.vars` (gitignored) — it must NEVER be set
 * in `wrangler.toml` or a production secret.
 */
export function requireMFA() {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const jwt = c.get('jwt')
    if (!jwt) return c.json({ error: 'unauthorized' }, 401)
    if (c.env.MFA_DEV_BYPASS === 'true') {
      await next()
      return
    }
    if (!jwt.amr.some((m) => m.method === 'totp')) {
      return c.json({ error: 'mfa_required' }, 403)
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
