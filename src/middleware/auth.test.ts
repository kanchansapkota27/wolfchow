import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv, JwtClaims } from '../types'
import { jwtMiddleware } from './jwt'
import {
  requireNotImpersonating,
  requirePermission,
  requireRestaurant,
  requireRole,
} from './guards'

const SECRET = 'test-secret-key-at-least-32-characters-long-000'
const testEnv = { SUPABASE_JWT_SECRET: SECRET } as unknown as Env

function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64url(value: string): string {
  return bytesToB64url(new TextEncoder().encode(value))
}

interface SignOptions {
  expiresInSec?: number
  secret?: string
}

async function signToken(
  claims: Partial<JwtClaims> & Record<string, unknown>,
  { expiresInSec = 3600, secret = SECRET }: SignOptions = {},
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(JSON.stringify({ iat: now, exp: now + expiresInSec, ...claims }))
  const data = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${bytesToB64url(new Uint8Array(signature))}`
}

function makeApp(): Hono<HonoEnv> {
  const app = new Hono<HonoEnv>()

  app.use('/me', jwtMiddleware)
  app.get('/me', (c) => c.json({ jwt: c.get('jwt') }))

  app.use('/admin', jwtMiddleware, requireRole('restaurant_owner', 'superadmin'))
  app.get('/admin', (c) => c.json({ ok: true }))

  app.use('/accept', jwtMiddleware, requirePermission('orders:accept'))
  app.get('/accept', (c) => c.json({ ok: true }))

  app.use('/tenant', jwtMiddleware, requireRestaurant())
  app.get('/tenant', (c) => c.json({ ok: true }))

  app.use('/billing', jwtMiddleware, requireNotImpersonating('billing-change'))
  app.get('/billing', (c) => c.json({ ok: true }))

  return app
}

function auth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } }
}

describe('STORY-003 · JWT middleware + permission guard', () => {
  it('valid token: attaches claims to context', async () => {
    const app = makeApp()
    const token = await signToken({
      sub: 'user-1',
      role: 'restaurant_owner',
      restaurant_id: 'rest-1',
      permissions: ['orders:accept'],
    })
    const res = await app.request('/me', auth(token), testEnv)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { jwt: JwtClaims }
    expect(body.jwt.sub).toBe('user-1')
    expect(body.jwt.role).toBe('restaurant_owner')
    expect(body.jwt.restaurant_id).toBe('rest-1')
    expect(body.jwt.permissions).toEqual(['orders:accept'])
    expect(body.jwt.imp).toBe(false)
  })

  it('expired token: 401 with token_expired', async () => {
    const app = makeApp()
    const token = await signToken({ sub: 'u', role: 'kitchen' }, { expiresInSec: -60 })
    const res = await app.request('/me', auth(token), testEnv)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'token_expired' })
  })

  it('tampered signature: 401 with token_invalid', async () => {
    const app = makeApp()
    // Signed with a different secret → signature fails to verify under SECRET.
    const token = await signToken({ sub: 'u', role: 'kitchen' }, { secret: 'a-totally-different-secret-value-here' })
    const res = await app.request('/me', auth(token), testEnv)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'token_invalid' })
  })

  it('missing header: 401 with unauthorized', async () => {
    const app = makeApp()
    const res = await app.request('/me', {}, testEnv)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('requireRole admin, kitchen JWT: 403', async () => {
    const app = makeApp()
    const token = await signToken({ sub: 'u', role: 'kitchen', restaurant_id: 'rest-1' })
    const res = await app.request('/admin', auth(token), testEnv)
    expect(res.status).toBe(403)
    expect((await res.json() as { error: string }).error).toBe('forbidden')
  })

  it('requirePermission orders:accept, missing permission: 403', async () => {
    const app = makeApp()
    const token = await signToken({ sub: 'u', role: 'kitchen', restaurant_id: 'rest-1', permissions: [] })
    const res = await app.request('/accept', auth(token), testEnv)
    expect(res.status).toBe(403)
    expect((await res.json() as { code: string }).code).toBe('insufficient_permission')
  })

  it('requireRestaurant, superadmin JWT (restaurant_id null): 400', async () => {
    const app = makeApp()
    const token = await signToken({ sub: 'u', role: 'superadmin' })
    const res = await app.request('/tenant', auth(token), testEnv)
    expect(res.status).toBe(400)
    expect((await res.json() as { error: string }).error).toBe('restaurant_required')
  })

  it('requireNotImpersonating billing-change, imp=true JWT: 403', async () => {
    const app = makeApp()
    const token = await signToken({ sub: 'u', role: 'restaurant_owner', restaurant_id: 'rest-1', imp: true })
    const res = await app.request('/billing', auth(token), testEnv)
    expect(res.status).toBe(403)
    expect((await res.json() as { code: string }).code).toBe('impersonation_blocked')
  })
})
