import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerTabletRoutes } from './index'
import { signJwt } from '../../services/tokens'

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

const app = new Hono<HonoEnv>()
registerTabletRoutes(app)

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440099'

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  MENU_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  DEVICE_TOKENS: { get: vi.fn() },
  MASTER_ENCRYPTION_KEY: btoa('a'.repeat(32)),
} as unknown as Env

// waitUntil() requires a real ExecutionContext — app.request() has none by default.
const fakeExecutionCtx = { waitUntil: (p: Promise<unknown>) => void p, passThroughOnException: () => {} } as unknown as ExecutionContext

async function deviceToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'device-1', role: 'tablet_device', restaurant_id: RESTAURANT_ID, device_id: DEVICE_ID, permissions: [], imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

async function staffToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'staff-1', role: 'kitchen', restaurant_id: RESTAURANT_ID, device_id: null, permissions: [], imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function chain() {
  const resolved = { data: null, error: null }
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-102 · tablet heartbeat actually writes last_seen_at', () => {
  it('device session: the devices.update chain is actually invoked (awaited), not just built', async () => {
    const table = chain()
    mockFrom.mockReturnValueOnce(table)
    ;(env.DEVICE_TOKENS.get as ReturnType<typeof vi.fn>).mockResolvedValue('token-ref')

    const token = await deviceToken()
    const res = await app.request('/tablet/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(204)
    expect(mockFrom).toHaveBeenCalledWith('devices')
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ last_seen_at: expect.any(String) }))
    expect(table.eq).toHaveBeenCalledWith('id', DEVICE_ID)
    expect(table.eq).toHaveBeenCalledWith('restaurant_id', RESTAURANT_ID)
    expect(table.is).toHaveBeenCalledWith('revoked_at', null)
    // The regression this guards against: `void chain` never calls .then(),
    // so the request is built but never actually sent. Confirm it resolved.
    expect(table.then).toHaveBeenCalled()
  })

  it('staff session (no device_id): 204, no devices table touched', async () => {
    const token = await staffToken()
    const res = await app.request('/tablet/heartbeat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(204)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
