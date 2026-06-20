import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

const app = new Hono<HonoEnv>()
registerAdminRoutes(app)

// ── Fake env ──────────────────────────────────────────────────────────────────

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
    {
      sub: '550e8400-e29b-41d4-a716-446655440010',
      role: 'restaurant_owner',
      restaurant_id: RESTAURANT_ID,
      permissions: [],
      device_id: null,
      imp: false,
      imp_by: null,
      amr: [],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
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
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

const FUTURE_DATE = '2099-12-25'
const PAST_DATE   = '2020-01-01'

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-018 · Special closures', () => {
  it('create full closure: 201, stored, KV invalidated', async () => {
    const fakeClosure = { id: '550e8400-e29b-41d4-a716-446655440020', restaurant_id: RESTAURANT_ID, closure_type: 'full', date: FUTURE_DATE, recurring: false }
    mockFrom.mockReturnValueOnce(chain({ data: fakeClosure }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/closures',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ closure_type: 'full', date: FUTURE_DATE }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeClosure
    expect(body.closure_type).toBe('full')
    expect(mockKv.delete).toHaveBeenCalledWith(`hours:${RESTAURANT_ID}`)
  })

  it('create partial without times: 422 partial_times_required', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/closures',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ closure_type: 'partial', date: FUTURE_DATE }),
      },
      env,
    )

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('partial_times_required')
  })

  it('recurring closure: stored with recurring=true', async () => {
    const fakeClosure = { id: '550e8400-e29b-41d4-a716-446655440021', restaurant_id: RESTAURANT_ID, closure_type: 'holiday', date: FUTURE_DATE, recurring: true }
    mockFrom.mockReturnValueOnce(chain({ data: fakeClosure }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/closures',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ closure_type: 'holiday', date: FUTURE_DATE, recurring: true }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeClosure
    expect(body.recurring).toBe(true)
  })

  it('past date: 201 with X-Warning header', async () => {
    const fakeClosure = { id: '550e8400-e29b-41d4-a716-446655440022', restaurant_id: RESTAURANT_ID, closure_type: 'full', date: PAST_DATE, recurring: false }
    mockFrom.mockReturnValueOnce(chain({ data: fakeClosure }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/closures',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ closure_type: 'full', date: PAST_DATE }),
      },
      env,
    )

    expect(res.status).toBe(201)
    expect(res.headers.get('X-Warning')).toBe('closure-in-past')
  })
})
