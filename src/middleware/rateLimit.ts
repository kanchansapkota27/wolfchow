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

/** 60/min, keyed by client IP. Public menu + slot generation. */
export const publicRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_PUBLIC,
  period: 60,
  key: (c) => c.req.header('CF-Connecting-IP') ?? 'unknown',
})

/** 30/min, keyed by JWT `sub`. Order placement + payment confirm. */
export const orderRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_ORDER,
  period: 60,
  key: (c) => c.get('jwt')?.sub ?? 'anonymous',
})

/** 120/min, keyed by `restaurant_id`. All admin mutation routes. */
export const writeRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_WRITE,
  period: 60,
  key: (c) => c.get('jwt')?.restaurant_id ?? 'no-restaurant',
})

/** 10/min, keyed by tracking token. Order tracking endpoint. */
export const trackingRateLimit = rateLimit({
  binding: (env) => env.RATE_LIMITER_TRACKING,
  period: 60,
  key: (c) => c.req.param('token') ?? c.req.header('X-Tracking-Token') ?? 'unknown',
})
