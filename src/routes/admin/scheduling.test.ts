import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
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
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  }
}

const fakeConfig = {
  base_prep_minutes: 15,
  scheduling_interval: 30,
  future_days_allowed: 7,
}

// Always-open hours for all 7 days (00:00 → 23:30, active)
const alwaysOpenHours = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  open_time: '00:00',
  close_time: '23:30',
  active: true,
  last_order_offset_minutes: 0,
  crosses_midnight: false,
}))

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockKv.delete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('STORY-019 · Scheduling configuration', () => {
  it('PATCH base_prep_minutes 25: stored, KV invalidated', async () => {
    const updated = { ...fakeConfig, base_prep_minutes: 25 }
    mockFrom.mockReturnValueOnce(chain({ data: updated }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/scheduling',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ base_prep_minutes: 25 }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as typeof updated
    expect(body.base_prep_minutes).toBe(25)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })

  it('scheduling_interval 45: 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/scheduling',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ scheduling_interval: 45 }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('future_days_allowed 35: 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/scheduling',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ future_days_allowed: 35 }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('preview: 10 slots returned, all in future', async () => {
    // Pin time to a known UTC moment: 2026-01-05 Monday 10:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'))

    mockFrom.mockReturnValueOnce(chain({ data: { base_prep_minutes: 15, scheduling_interval: 30, future_days_allowed: 7 } }))
    mockKv.get.mockResolvedValue(alwaysOpenHours)

    const token = await ownerToken()
    const res = await app.request('/admin/scheduling/preview', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { slots: string[] }
    expect(body.slots).toHaveLength(10)

    const nowMs = Date.now()
    for (const slot of body.slots) {
      expect(new Date(slot).getTime()).toBeGreaterThan(nowMs)
    }
  })

  it('preview: slots are multiples of scheduling_interval minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'))

    const interval = 15
    mockFrom.mockReturnValueOnce(chain({ data: { base_prep_minutes: 10, scheduling_interval: interval, future_days_allowed: 7 } }))
    mockKv.get.mockResolvedValue(alwaysOpenHours)

    const token = await ownerToken()
    const res = await app.request('/admin/scheduling/preview', { headers: authHeaders(token) }, env)

    const body = await res.json() as { slots: string[] }
    for (const slot of body.slots) {
      const mins = new Date(slot).getUTCMinutes()
      expect(mins % interval).toBe(0)
    }
  })
})
