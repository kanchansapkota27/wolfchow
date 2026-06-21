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

const mockBroadcaster = { broadcast: vi.fn() }

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { broadcaster: mockBroadcaster })

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
const NOTICE_ID     = '550e8400-e29b-41d4-a716-446655440050'
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

const VALID_NOTICE = {
  type: 'informational' as const,
  message: 'Kitchen closed for cleaning 3-4pm',
  display_locations: ['storefront', 'tablet'],
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-028 · Notices & announcements', () => {
  it('list notices: returns array', async () => {
    const notices = [{ id: NOTICE_ID, ...VALID_NOTICE, restaurant_id: RESTAURANT_ID, priority: 0 }]
    mockFrom.mockReturnValueOnce(chain({ data: notices }))

    const token = await ownerToken()
    const res = await app.request('/admin/notices', {
      method: 'GET',
      headers: authHeaders(token),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { notices: typeof notices }
    expect(body.notices).toHaveLength(1)
    expect(body.notices[0].type).toBe('informational')
  })

  it('create notice: 201 + broadcasts notice_created', async () => {
    const saved = { id: NOTICE_ID, ...VALID_NOTICE, restaurant_id: RESTAURANT_ID, priority: 0 }
    mockFrom.mockReturnValueOnce(chain({ data: saved }))

    const token = await ownerToken()
    const res = await app.request('/admin/notices', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(VALID_NOTICE),
    }, env)

    expect(res.status).toBe(201)
    const body = await res.json() as typeof saved
    expect(body.type).toBe('informational')
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(RESTAURANT_ID, 'notice_created', saved, expect.anything())
  })

  it('create notice missing display_locations: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/notices', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({ type: 'warning', message: 'Alert', display_locations: [] }),
    }, env)
    expect(res.status).toBe(422)
  })

  it('delete existing notice: 204 + broadcasts notice_removed', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: NOTICE_ID } }))  // select existing
      .mockReturnValueOnce(chain({ data: null }))                // delete

    const token = await ownerToken()
    const res = await app.request(`/admin/notices/${NOTICE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }, env)

    expect(res.status).toBe(204)
    expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(RESTAURANT_ID, 'notice_removed', { id: NOTICE_ID }, expect.anything())
  })

  it('delete non-existent notice: 404', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null }))  // select returns nothing

    const token = await ownerToken()
    const res = await app.request(`/admin/notices/${NOTICE_ID}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    }, env)
    expect(res.status).toBe(404)
  })
})
