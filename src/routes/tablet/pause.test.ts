import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerTabletRoutes } from './index'
import { signJwt } from '../../services/tokens'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

// ── App ───────────────────────────────────────────────────────────────────────

const mockBroadcast = vi.fn()

const app = new Hono<HonoEnv>()
registerTabletRoutes(app, { broadcaster: { broadcast: mockBroadcast } })

// ── Env ───────────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'

const mockKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: mockKv,
  MENU_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  DEVICE_TOKENS: { get: vi.fn() },
  MASTER_ENCRYPTION_KEY: btoa('a'.repeat(32)),
} as unknown as Env

async function makeToken(role: 'kitchen' | 'tablet_device', permissions: string[] = []) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'user-1', role, restaurant_id: RESTAURANT_ID, permissions, device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function chain(data: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  }
}

const pausedManual = {
  orders_paused: true,
  pause_mode: 'manual',
  pause_until: null,
  pause_reason: null,
  pause_scheduled_orders: false,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.delete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('STORY-034 · Tablet pause/unpause', () => {
  it('pause timed: 200, pause_until set, KV invalidated, broadcast fired', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'))
    const expectedUntil = new Date('2026-01-05T10:30:00.000Z').toISOString()
    mockFrom.mockReturnValueOnce(chain({ ...pausedManual, pause_mode: 'timed', pause_until: expectedUntil }))

    const token = await makeToken('kitchen', ['orders:pause'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/pause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'timed', duration_minutes: 30 }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as Omit<typeof pausedManual, 'pause_until'> & { pause_until: string }
    expect(body.orders_paused).toBe(true)
    expect(body.pause_until).toBe(expectedUntil)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'pause_state_changed',
      expect.objectContaining({ paused: true, mode: 'timed' }),
      expect.anything(),
    )
  })

  it('pause manual: 200, pause_until null, broadcast fired', async () => {
    mockFrom.mockReturnValueOnce(chain(pausedManual))

    const token = await makeToken('kitchen', ['orders:pause'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/pause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as typeof pausedManual
    expect(body.pause_until).toBeNull()
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'pause_state_changed',
      expect.objectContaining({ paused: true, mode: 'manual' }),
      expect.anything(),
    )
  })

  it('rest_of_day mode rejected: 422', async () => {
    const token = await makeToken('kitchen', ['orders:pause'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/pause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'rest_of_day' }),
      }),
      env,
    )
    expect(res.status).toBe(422)
  })

  it('without orders:pause permission: 403', async () => {
    const token = await makeToken('kitchen', [])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/pause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
    const body = await res.json() as { error: string; required_permission: string }
    expect(body.error).toBe('forbidden')
    expect(body.required_permission).toBe('orders:pause')
  })

  it('tablet_device role with permission: 200', async () => {
    mockFrom.mockReturnValueOnce(chain(pausedManual))

    const token = await makeToken('tablet_device', ['orders:pause'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/pause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'manual' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
  })

  it('unpause: 200, orders_paused=false, broadcast fired', async () => {
    const unpausedState = { orders_paused: false, pause_mode: null, pause_until: null, pause_reason: null, pause_scheduled_orders: false }
    mockFrom.mockReturnValueOnce(chain(unpausedState))

    const token = await makeToken('kitchen', ['orders:pause'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/unpause', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      }),
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
