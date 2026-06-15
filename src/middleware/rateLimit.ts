import { createMiddleware } from 'hono/factory'
import type { Context, MiddlewareHandler } from 'hono'
import type { Env, HonoEnv, RateLimit } from '../types'

/**
 * Edge rate limiting via Cloudflare's Rate Limiting binding, applied before any
 * handler logic. One binding per route group (see wrangler.toml) so each can
 * carry its own limit/period. On breach: 429 `{ error: "rate_limit_exceeded" }`
 * with a `Retry-After` header (the binding's period in seconds).
 *
 * Note: the CF binding does not enforce limits in local dev / the test pool
 * (`limit()` returns `success: true`), so the binding is selected via a function
 * that tests can point at an injected fake.
 */
interface RateLimitConfig {
  /** Selects the binding for this limiter from the env. */
  binding: (env: Env) => RateLimit
  /** Configured period in seconds — emitted as `Retry-After` on breach. */
  period: number
  /** Derives the rate-limit key for a request. */
  key: (c: Context<HonoEnv>) => string
}

function rateLimit({ binding, period, key }: RateLimitConfig): MiddlewareHandler<HonoEnv> {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const { success } = await binding(c.env).limit({ key: key(c) })
    if (!success) {
      c.header('Retry-After', String(period))
      return c.json({ error: 'rate_limit_exceeded' }, 429)
    }
    await next()
  })
}

/**
 * Client IP from the trusted Cloudflare edge header. `CF-Connecting-IP` is set
 * by Cloudflare and cannot be spoofed by the client (unlike `X-Forwarded-For`).
 * Falls back to a constant only off-edge (e.g. tests); on a deployed Worker it
 * is always present.
 */
function clientIp(c: Context<HonoEnv>): string {
  return c.req.header('CF-Connecting-IP') ?? 'unknown'
}

/** 60/min, keyed by client IP. Public menu + slot generation. */
export const publicRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_PUBLIC,
  period: 60,
  key: clientIp,
})

/**
 * 30/min, keyed by JWT `sub`. Order placement + payment confirm. Runs after
 * jwtMiddleware, so `sub` is normally present; if it is somehow absent we key
 * by client IP rather than a shared constant (no global bucket to exhaust).
 */
export const orderRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_ORDER,
  period: 60,
  key: (c) => c.get('jwt')?.sub ?? clientIp(c),
})

/**
 * 120/min for all admin mutation routes. Keyed by `restaurant_id` for tenant
 * users; platform roles (superadmin/support, null `restaurant_id`) are keyed
 * per-principal as `platform:<sub>` so they get isolated buckets — one platform
 * admin cannot exhaust the limit for the others. Final fallback is per-IP, never
 * a shared constant.
 */
export const writeRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_WRITE,
  period: 60,
  key: (c) => {
    const jwt = c.get('jwt')
    if (jwt?.restaurant_id) return jwt.restaurant_id
    if (jwt?.sub) return `platform:${jwt.sub}`
    return clientIp(c)
  },
})

/**
 * 10/min for the public order-tracking endpoint, keyed by client IP.
 *
 * NOTE (deviates from the spec's "keyed by tracking token", see ADR-002):
 * the tracking token is attacker-controlled (it is in the URL), so keying on it
 * would let an attacker rotate/guess tokens to get an unbounded number of
 * buckets — defeating the limit and enabling token enumeration. Keying on the
 * trusted client IP bounds any single source regardless of how many tokens it
 * probes. The client-settable `X-Tracking-Token` fallback is removed for the
 * same reason (it let the caller choose its own bucket).
 */
export const trackingRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_TRACKING,
  period: 60,
  key: clientIp,
})
