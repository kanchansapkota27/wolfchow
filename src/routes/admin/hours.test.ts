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
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

/** Build a valid 7-day hours payload. */
function sevenDays(overrides: Partial<Record<number, object>> = {}) {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    open_time: '09:00',
    close_time: '21:00',
    active: true,
    last_order_offset_minutes: 0,
    ...overrides[i],
  }))
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-017 · Operating hours', () => {
  it('upsert 7 days: all stored, KV invalidated', async () => {
    const stored = sevenDays().map((d) => ({ ...d, restaurant_id: RESTAURANT_ID, crosses_midnight: false }))
    mockFrom.mockReturnValueOnce(chain({ data: stored }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/hours',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(sevenDays()),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { hours: unknown[] }
    expect(body.hours).toHaveLength(7)
    expect(mockKv.delete).toHaveBeenCalledWith(`hours:${RESTAURANT_ID}`)
  })

  it('Friday 17:00 → 02:00: crosses_midnight=true', async () => {
    const days = sevenDays({ 5: { open_time: '17:00', close_time: '02:00' } })
    const stored = days.map((d) => ({
      ...d,
      restaurant_id: RESTAURANT_ID,
      crosses_midnight: d.day_of_week === 5,
    }))
    mockFrom.mockReturnValueOnce(chain({ data: stored }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/hours',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(days),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { hours: Array<{ day_of_week: number; crosses_midnight: boolean }> }
    const friday = body.hours.find((h) => h.day_of_week === 5)
    expect(friday?.crosses_midnight).toBe(true)
  })

  it('Saturday 22:00 → 22:00: crosses_midnight=false (same time = 24h)', async () => {
    const days = sevenDays({ 6: { open_time: '22:00', close_time: '22:00' } })
    const stored = days.map((d) => ({ ...d, restaurant_id: RESTAURANT_ID, crosses_midnight: false }))
    mockFrom.mockReturnValueOnce(chain({ data: stored }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/hours',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(days),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { hours: Array<{ day_of_week: number; crosses_midnight: boolean }> }
    const saturday = body.hours.find((h) => h.day_of_week === 6)
    expect(saturday?.crosses_midnight).toBe(false)
  })

  it('last_order_offset_minutes 250: 422', async () => {
    const days = sevenDays({ 0: { last_order_offset_minutes: 250 } })

    const token = await ownerToken()
    const res = await app.request(
      '/admin/hours',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(days),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('invalid time format: 422', async () => {
    const days = sevenDays({ 1: { open_time: '9:00' } })  // missing leading zero

    const token = await ownerToken()
    const res = await app.request(
      '/admin/hours',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(days),
      },
      env,
    )

    expect(res.status).toBe(422)
  })
})
