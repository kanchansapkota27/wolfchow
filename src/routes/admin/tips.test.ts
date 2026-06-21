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

describe('STORY-025 · Tip & tax configuration', () => {
  it('PATCH tips: enable with presets, KV invalidated', async () => {
    const updated = { tips_enabled: true, tip_presets: [10, 15, 20], allow_custom_tip: true, show_no_tip: true }
    mockFrom.mockReturnValueOnce(chain({ data: updated }))

    const token = await ownerToken()
    const res = await app.request('/admin/tips', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tips_enabled: true, tip_presets: [10, 15, 20], allow_custom_tip: true, show_no_tip: true }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as typeof updated
    expect(body.tips_enabled).toBe(true)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })

  it('7 presets: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tips', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tip_presets: [5, 10, 15, 20, 25, 30, 35] }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('preset value 101: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tips', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tip_presets: [101] }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('tips_enabled=true but allow_custom_tip=false and show_no_tip=false: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tips', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tips_enabled: true, allow_custom_tip: false, show_no_tip: false }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('PATCH tax: tax_rate=18, tax_inclusive=false stored, KV invalidated', async () => {
    const updated = { tax_enabled: true, tax_rate: 18, tax_inclusive: false }
    mockFrom.mockReturnValueOnce(chain({ data: updated }))

    const token = await ownerToken()
    const res = await app.request('/admin/tax', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tax_enabled: true, tax_rate: 18, tax_inclusive: false }),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as typeof updated
    expect(body.tax_rate).toBe(18)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })

  it('tax_enabled=true, tax_rate=0: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tax', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tax_enabled: true, tax_rate: 0 }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('tax_rate negative: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tax', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tax_rate: -5 }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('tax_rate 101: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/tax', {
      method: 'PATCH',
      headers: authHeaders(token),
      body: JSON.stringify({ tax_rate: 101 }),
    }, env)
    expect(res.status).toBe(422)
  })
})
