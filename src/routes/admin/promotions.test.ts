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
const PROMO_ID      = '550e8400-e29b-41d4-a716-446655440030'
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
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

const VALID_PROMO = {
  title: '10% Off',
  discount_type: 'percentage',
  discount_value: 10,
  auto_apply: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue({ feature_flags: { promotions_enabled: true } })
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-027 · Promotions management', () => {
  it('create % promo: stored, KV invalidated', async () => {
    const saved = { id: PROMO_ID, ...VALID_PROMO, restaurant_id: RESTAURANT_ID, active: true, usage_count: 0 }
    mockFrom.mockReturnValueOnce(chain({ data: saved }))  // insert (promo_code check skipped — auto_apply)

    const token = await ownerToken()
    const res = await app.request('/admin/promotions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(VALID_PROMO),
    }, env)

    expect(res.status).toBe(201)
    const body = await res.json() as typeof saved
    expect(body.discount_type).toBe('percentage')
    expect(mockKv.delete).toHaveBeenCalledWith(`promos:${RESTAURANT_ID}`)
  })

  it('duplicate promo_code in restaurant: 409', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'existing-promo' } }))  // duplicate check returns row

    const token = await ownerToken()
    const res = await app.request('/admin/promotions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_PROMO, auto_apply: false, promo_code: 'SAVE10' }),
    }, env)

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('duplicate_promo_code')
  })

  it('end_time before start_time: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/promotions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_PROMO, start_time: '2026-06-20T12:00:00Z', end_time: '2026-06-20T10:00:00Z' }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('no auto_apply and no promo_code: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/promotions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ title: 'Bad', discount_type: 'fixed', discount_value: 5, auto_apply: false }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('plan without promotions_enabled: 402', async () => {
    mockKv.get.mockResolvedValue({ feature_flags: { promotions_enabled: false } })

    const token = await ownerToken()
    const res = await app.request('/admin/promotions', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(VALID_PROMO),
    }, env)

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; feature: string }
    expect(body.error).toBe('feature_locked')
    expect(body.feature).toBe('promotions_enabled')
  })

  it('delete with usage_count > 0: 409', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: PROMO_ID, usage_count: 5 } }))

    const token = await ownerToken()
    const res = await app.request(`/admin/promotions/${PROMO_ID}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }, env)

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('promo_has_usage')
  })
})
