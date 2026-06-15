import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { Env, HonoEnv, JwtClaims, RateLimit } from '../types'
import { orderRateLimit, publicRateLimit, trackingRateLimit, writeRateLimit } from './rateLimit'

// Fake limiter that counts calls per key and reports success while under `max`.
// Mirrors how the real CF binding behaves once a window is exceeded, but
// deterministically (the real binding does not enforce locally).
function makeLimiter(max: number): RateLimit {
  const counts = new Map<string, number>()
  return {
    limit: async ({ key }) => {
      const next = (counts.get(key) ?? 0) + 1
      counts.set(key, next)
      return { success: next <= max }
    },
  }
}

function makeEnv(): Env {
  return {
    RATE_LIMITER_PUBLIC: makeLimiter(60),
    RATE_LIMITER_ORDER: makeLimiter(30),
    RATE_LIMITER_WRITE: makeLimiter(120),
    RATE_LIMITER_TRACKING: makeLimiter(10),
  } as unknown as Env
}

// Stand-in for jwtMiddleware: sets claims from headers. `X-Test-Restaurant`
// present → tenant user; absent → platform role (restaurant_id null).
const injectJwt = createMiddleware<HonoEnv>(async (c, next) => {
  const sub = c.req.header('X-Test-Sub')
  if (sub) {
    const restaurant = c.req.header('X-Test-Restaurant') ?? null
    c.set('jwt', {
      sub,
      role: restaurant ? 'restaurant_owner' : 'superadmin',
      restaurant_id: restaurant,
      permissions: [],
      device_id: null,
      imp: false,
      imp_by: null,
    } satisfies JwtClaims)
  }
  await next()
})

function makeApp(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()
  app.use('/public', publicRateLimit)
  app.get('/public', (c) => c.json({ ok: true }))

  app.use('/order', injectJwt, orderRateLimit)
  app.get('/order', (c) => c.json({ ok: true }))

  app.use('/write', injectJwt, writeRateLimit)
  app.get('/write', (c) => c.json({ ok: true }))

  app.use('/track/:token', trackingRateLimit)
  app.get('/track/:token', (c) => c.json({ ok: true }))

  return app
}

const ipHeaders = { 'CF-Connecting-IP': '203.0.113.7' }

describe('STORY-004 · rate limiting middleware', () => {
  it('61st public request from same IP: 429', async () => {
    const app = makeApp()
    const env = makeEnv()
    for (let i = 0; i < 60; i++) {
      const res = await app.request('/public', { headers: ipHeaders }, env)
      expect(res.status).toBe(200)
    }
    const breach = await app.request('/public', { headers: ipHeaders }, env)
    expect(breach.status).toBe(429)
    expect(await breach.json()).toEqual({ error: 'rate_limit_exceeded' })
  })

  it('31st order-create from same JWT sub: 429', async () => {
    const app = makeApp()
    const env = makeEnv()
    const headers = { 'X-Test-Sub': 'user-1' }
    for (let i = 0; i < 30; i++) {
      const res = await app.request('/order', { headers }, env)
      expect(res.status).toBe(200)
    }
    const breach = await app.request('/order', { headers }, env)
    expect(breach.status).toBe(429)
  })

  it('Retry-After header present on 429', async () => {
    const app = makeApp()
    const env = makeEnv()
    // tracking limit is 10/min — easiest to breach
    for (let i = 0; i < 10; i++) {
      await app.request('/track/ord_live_abc', { headers: ipHeaders }, env)
    }
    const breach = await app.request('/track/ord_live_abc', { headers: ipHeaders }, env)
    expect(breach.status).toBe(429)
    expect(breach.headers.get('Retry-After')).toBe('60')
  })

  it('auth request not affected by public IP limit', async () => {
    const app = makeApp()
    const env = makeEnv()
    // Exhaust the public limiter for this IP.
    for (let i = 0; i < 61; i++) {
      await app.request('/public', { headers: ipHeaders }, env)
    }
    const exhausted = await app.request('/public', { headers: ipHeaders }, env)
    expect(exhausted.status).toBe(429)

    // An authenticated route uses a separate (JWT-keyed) limiter and is unaffected.
    const authed = await app.request('/order', { headers: { ...ipHeaders, 'X-Test-Sub': 'user-9' } }, env)
    expect(authed.status).toBe(200)
  })

  it('different IPs are limited independently', async () => {
    const app = makeApp()
    const env = makeEnv()
    for (let i = 0; i < 61; i++) {
      await app.request('/public', { headers: { 'CF-Connecting-IP': '198.51.100.1' } }, env)
    }
    const other = await app.request('/public', { headers: { 'CF-Connecting-IP': '198.51.100.2' } }, env)
    expect(other.status).toBe(200)
  })

  // --- Security hardening (security review of STORY-004) ---

  it('tracking limiter keys on IP: rotating the token does not bypass it', async () => {
    const app = makeApp()
    const env = makeEnv()
    // 10 allowed from this IP, using one token...
    for (let i = 0; i < 10; i++) {
      const res = await app.request('/track/ord_live_aaa', { headers: ipHeaders }, env)
      expect(res.status).toBe(200)
    }
    // ...an 11th request from the SAME IP but a DIFFERENT token is still blocked.
    const rotated = await app.request('/track/ord_live_zzz', { headers: ipHeaders }, env)
    expect(rotated.status).toBe(429)
  })

  it('writeRateLimit: platform admins (null restaurant_id) get isolated buckets', async () => {
    const app = makeApp()
    const env = makeEnv()
    // Exhaust admin-1's 120/min bucket (no X-Test-Restaurant → restaurant_id null).
    for (let i = 0; i < 120; i++) {
      const res = await app.request('/write', { headers: { 'X-Test-Sub': 'admin-1' } }, env)
      expect(res.status).toBe(200)
    }
    const adminOneBreach = await app.request('/write', { headers: { 'X-Test-Sub': 'admin-1' } }, env)
    expect(adminOneBreach.status).toBe(429)

    // A different platform admin is unaffected — no shared global bucket.
    const adminTwo = await app.request('/write', { headers: { 'X-Test-Sub': 'admin-2' } }, env)
    expect(adminTwo.status).toBe(200)
  })
})
