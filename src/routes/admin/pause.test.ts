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

// ── App with broadcaster dep ──────────────────────────────────────────────────

const mockBroadcast = vi.fn()

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { broadcaster: { broadcast: mockBroadcast } })

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

async function makeToken(role: string, permissions: string[] = []) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: '550e8400-e29b-41d4-a716-446655440010',
      role,
      restaurant_id: RESTAURANT_ID,
      permissions,
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

const pausedState = {
  orders_paused: true,
  pause_mode: 'timed',
  pause_until: null as string | null,
  pause_reason: null,
  pause_scheduled_orders: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockKv.delete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('STORY-020 · Pause ordering system', () => {
  it('pause timed 15m: pause_until = now + 15m, broadcast', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'))

    const expectedUntil = new Date('2026-01-05T10:15:00.000Z').toISOString()
    mockFrom.mockReturnValueOnce(chain({ data: { ...pausedState, pause_mode: 'timed', pause_until: expectedUntil } }))

    const token = await makeToken('restaurant_owner')
    const res = await app.request(
      '/admin/orders/pause',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ mode: 'timed', duration_minutes: 15 }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as typeof pausedState
    expect(body.orders_paused).toBe(true)
    expect(body.pause_until).toBe(expectedUntil)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'pause_state_changed',
      expect.objectContaining({ paused: true, mode: 'timed' }),
      expect.anything(),
    )
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })

  it('pause manual: pause_until null, broadcast', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...pausedState, pause_mode: 'manual', pause_until: null } }))

    const token = await makeToken('restaurant_owner')
    const res = await app.request(
      '/admin/orders/pause',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ mode: 'manual' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as typeof pausedState
    expect(body.pause_until).toBeNull()
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'pause_state_changed',
      expect.objectContaining({ paused: true, mode: 'manual' }),
      expect.anything(),
    )
  })

  it('unpause: orders_paused=false, broadcast', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { orders_paused: false, pause_mode: null, pause_until: null, pause_reason: null, pause_scheduled_orders: false } }))

    const token = await makeToken('restaurant_owner')
    const res = await app.request(
      '/admin/orders/unpause',
      { method: 'POST', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { orders_paused: boolean }
    expect(body.orders_paused).toBe(false)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'pause_state_changed',
      { paused: false },
      expect.anything(),
    )
  })

})
