import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

const app = new Hono<HonoEnv>()
registerAdminRoutes(app)

const mockKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  MEDIA_BUCKET: {},
  R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'media',
} as unknown as Env

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const JWT_SECRET    = 'test-secret-at-least-32-characters-long-xx'

async function ownerToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: '550e8400-e29b-41d4-a716-446655440010', role: 'restaurant_owner', restaurant_id: RESTAURANT_ID, permissions: [], device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-026 · Auto-accept & auto-reject configuration', () => {
  it('enable auto_accept: stored, KV invalidated', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { auto_accept: true, auto_reject_enabled: false, auto_reject_minutes: 15 } }))

    const token = await ownerToken()
    const res = await app.request('/admin/orders/automation', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ auto_accept: true }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { auto_accept: boolean }
    expect(body.auto_accept).toBe(true)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })

  it('auto_reject_minutes 1 (below min): 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/orders/automation', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ auto_reject_minutes: 1 }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('auto_reject_minutes 16 (above max): 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/orders/automation', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ auto_reject_minutes: 16 }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('both auto_accept and auto_reject: allowed simultaneously', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { auto_accept: true, auto_reject_enabled: true, auto_reject_minutes: 10 } }))

    const token = await ownerToken()
    const res = await app.request('/admin/orders/automation', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ auto_accept: true, auto_reject_enabled: true, auto_reject_minutes: 10 }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { auto_accept: boolean; auto_reject_enabled: boolean }
    expect(body.auto_accept).toBe(true)
    expect(body.auto_reject_enabled).toBe(true)
  })
})
