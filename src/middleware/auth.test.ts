import { describe, expect, it, vi } from 'vitest'
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
const testEnv = { SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: 'http://unused' } as unknown as Env

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

// ── ES256 (ECDSA + JWKS) ──────────────────────────────────────────────────────

async function makeEs256Token(
  claims: Record<string, unknown>,
  privateKey: CryptoKey,
  kid: string,
): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(JSON.stringify({ iat: now, exp: now + 3600, ...claims }))
  const data = new TextEncoder().encode(`${header}.${payload}`)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data)
  return `${header}.${payload}.${bytesToB64url(new Uint8Array(sig))}`
}

// ES256 env: no SUPABASE_JWT_SECRET → middleware uses JWKS path.
describe('STORY-003 · JWT middleware — ES256', () => {
  it('valid ES256 token: accepted, claims attached', async () => {
    const { privateKey, publicKey } = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const kid = 'ec-key-1'
    const pubJwk = await crypto.subtle.exportKey('jwk', publicKey)
    const jwks = { keys: [{ ...pubJwk, kid, use: 'sig', alg: 'ES256' }] }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(jwks), { headers: { 'Content-Type': 'application/json' } }),
    )

    const token = await makeEs256Token(
      { sub: 'u-ec', role: 'superadmin', restaurant_id: null, permissions: [] },
      privateKey,
      kid,
    )

    const app = makeApp()
    // No SUPABASE_JWT_SECRET → env signals ES256 mode
    const env = { SUPABASE_URL: 'http://supa-ec1.test' } as unknown as Env
    const res = await app.request('/me', auth(token), env)

    expect(res.status).toBe(200)
    const body = (await res.json()) as { jwt: JwtClaims }
    expect(body.jwt.sub).toBe('u-ec')
    expect(body.jwt.role).toBe('superadmin')
  })

  it('ES256 token, wrong key (tampered): 401 token_invalid', async () => {
    const { privateKey: keyA } = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const { publicKey: keyB } = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const kid = 'ec-key-2'
    const pubJwkB = await crypto.subtle.exportKey('jwk', keyB)
    const jwks = { keys: [{ ...pubJwkB, kid, use: 'sig', alg: 'ES256' }] }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(jwks), { headers: { 'Content-Type': 'application/json' } }),
    )

    const token = await makeEs256Token({ sub: 'u', role: 'superadmin' }, keyA, kid)

    const app = makeApp()
    const env = { SUPABASE_URL: 'http://supa-ec2.test' } as unknown as Env
    const res = await app.request('/me', auth(token), env)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'token_invalid' })
  })

  it('ES256 token, JWKS endpoint down: 401 token_invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{}', { status: 503 }),
    )
    const { privateKey } = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const token = await makeEs256Token({ sub: 'u', role: 'superadmin' }, privateKey, 'ec-key-3')

    const app = makeApp()
    const env = { SUPABASE_URL: 'http://supa-ec3.test' } as unknown as Env
    const res = await app.request('/me', auth(token), env)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'token_invalid' })
  })
})

// SEC-009: Algorithm is pinned to env config — token header `alg` is ignored.
describe('SEC-009 · JWT algorithm pinned to env config', () => {
  it('ES256 token presented to HS256 env: 401 token_invalid (algorithm confusion blocked)', async () => {
    const { privateKey } = (await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const token = await makeEs256Token({ sub: 'u', role: 'superadmin' }, privateKey, 'ec-key-x')

    const app = makeApp()
    // HS256 env: SUPABASE_JWT_SECRET present → middleware uses HMAC, never tries JWKS
    const env = { SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: 'http://unused' } as unknown as Env
    const res = await app.request('/me', auth(token), env)
    // HS256 verification of an ECDSA-signed token always fails
    expect(res.status).toBe(401)
  })

  it('HS256 token presented to ES256 env: 401 token_invalid (algorithm confusion blocked)', async () => {
    const token = await signToken({ sub: 'u', role: 'superadmin' })

    // Publish a JWKS that has no matching EC key so ES256 path returns INVALID
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ keys: [] }), { headers: { 'Content-Type': 'application/json' } }),
    )

    const app = makeApp()
    // ES256 env: no SUPABASE_JWT_SECRET → middleware uses JWKS, never tries HMAC
    const env = { SUPABASE_URL: 'http://supa-alg-confusion.test' } as unknown as Env
    const res = await app.request('/me', auth(token), env)
    expect(res.status).toBe(401)
  })
})
