import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { signJwt } from '../../services/tokens'
import { registerSuperadminRoutes } from './index'

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)

const mockCounterFetch = vi.fn(async () => ({ status: 200, json: async () => ({ count: 0 }) }))
const envBypass = {
  SUPABASE_JWT_SECRET: JWT_SECRET,
  MFA_DEV_BYPASS: 'true',
  SUPABASE_URL: 'http://unused',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
  TENANT_COUNTER: { idFromName: () => 'id', get: () => ({ fetch: mockCounterFetch }) },
} as unknown as Env

async function superadminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'sa-user-1',
      role: 'superadmin',
      restaurant_id: null,
      permissions: [],
      amr: [{ method: 'password', timestamp: now }],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

async function tenantToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'owner-1',
      role: 'restaurant_owner',
      restaurant_id: 'rest-1',
      permissions: [],
      amr: [{ method: 'totp', timestamp: now }],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

function auth(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}` } }
}

describe('STORY-053 · SMTP routes — auth guard', () => {
  it('GET /superadmin/smtp/global: unauthenticated → 401', async () => {
    const res = await app.request('/superadmin/smtp/global', {}, envBypass)
    expect(res.status).toBe(401)
  })

  it('GET /superadmin/smtp/global: tenant role → 403', async () => {
    const t = await tenantToken()
    const res = await app.request('/superadmin/smtp/global', auth(t), envBypass)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('insufficient_role')
  })

  it('GET /superadmin/smtp/overrides: unauthenticated → 401', async () => {
    const res = await app.request('/superadmin/smtp/overrides', {}, envBypass)
    expect(res.status).toBe(401)
  })

  it('POST /superadmin/smtp/global: unauthenticated → 401', async () => {
    const res = await app.request('/superadmin/smtp/global', { method: 'POST' }, envBypass)
    expect(res.status).toBe(401)
  })

  it('POST /superadmin/smtp/test: unauthenticated → 401', async () => {
    const res = await app.request('/superadmin/smtp/test', { method: 'POST' }, envBypass)
    expect(res.status).toBe(401)
  })
})

describe('STORY-053 · SMTP routes — validation', () => {
  it('POST /superadmin/smtp/global: missing fields → 422', async () => {
    const t = await superadminToken()
    const res = await app.request(
      '/superadmin/smtp/global',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: 'smtp.test.com' }),
      },
      envBypass,
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('validation')
  })

  it('POST /superadmin/smtp/global: invalid port → 422', async () => {
    const t = await superadminToken()
    const payload = {
      host: 'smtp.example.com',
      port: 99999,
      username: 'user',
      password: 'pass',
      from_email: 'no-reply@example.com',
      from_name: 'RestroAPI',
    }
    const res = await app.request(
      '/superadmin/smtp/global',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      envBypass,
    )
    expect(res.status).toBe(422)
  })

  it('POST /superadmin/smtp/global: complete invalid body (no host) → 422, not 401/403', async () => {
    const t = await superadminToken()
    // A body that passes auth but fails schema: proves route is reachable by superadmin
    const res = await app.request(
      '/superadmin/smtp/global',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      envBypass,
    )
    // Auth accepted (not 401/403), but body is invalid → 422
    expect(res.status).toBe(422)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
