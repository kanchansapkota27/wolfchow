import { describe, expect, it, vi, beforeEach } from 'vitest'
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

const app = new Hono<HonoEnv>()
registerTabletRoutes(app)

// ── Fake env ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  MENU_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  DEVICE_TOKENS: { get: vi.fn() },
} as unknown as Env

async function makeToken(role: string, permissions: string[] = [], restaurantId = RESTAURANT_ID, deviceId: string | null = null) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: '550e8400-e29b-41d4-a716-000000000001',
      role,
      restaurant_id: restaurantId,
      permissions,
      device_id: deviceId,
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

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  }
}

const PAUSE_STATE = {
  orders_paused: false,
  pause_mode: null,
  pause_until: null,
  pause_reason: null,
  pause_scheduled_orders: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-030 · Tablet authentication', () => {
  it('valid tablet_device token: GET /tablet/session returns identity + pause state', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: PAUSE_STATE }))
    const token = await makeToken('tablet_device', ['orders:accept_reject'], RESTAURANT_ID, 'device-abc')
    const res = await app.fetch(
      new Request('http://localhost/tablet/session', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { identity: { role: string; device_id: string }; pause_state: unknown }
    expect(body.identity.role).toBe('tablet_device')
    expect(body.identity.device_id).toBe('device-abc')
    expect(body.pause_state).toMatchObject({ orders_paused: false })
  })

  it('valid kitchen token: GET /tablet/session returns identity', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: PAUSE_STATE }))
    const token = await makeToken('kitchen', ['orders:accept_reject', 'orders:status'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/session', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { identity: { role: string } }
    expect(body.identity.role).toBe('kitchen')
  })

  it('restaurant_owner JWT on /tablet/*: 403', async () => {
    const token = await makeToken('restaurant_owner')
    const res = await app.fetch(
      new Request('http://localhost/tablet/session', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('missing Authorization header: 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost/tablet/session'),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('identity contains correct restaurant_id and permissions', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: PAUSE_STATE }))
    const token = await makeToken('kitchen', ['orders:accept_reject', 'inventory:write'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/session', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    const body = await res.json() as { identity: { restaurant_id: string; permissions: string[] } }
    expect(body.identity.restaurant_id).toBe(RESTAURANT_ID)
    expect(body.identity.permissions).toContain('orders:accept_reject')
    expect(body.identity.permissions).toContain('inventory:write')
  })
})
