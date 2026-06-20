import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockInviteByEmail = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    auth: { admin: { inviteUserByEmail: mockInviteByEmail } },
  }),
  createAnonClient: () => ({}),
}))

const app = new Hono<HonoEnv>()
registerAdminRoutes(app)

// ── Fake env ──────────────────────────────────────────────────────────────────

const mockKv       = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
const mockDeviceKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  DEVICE_TOKENS: mockDeviceKv,
  MEDIA_BUCKET: {},
  R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'media',
} as unknown as Env

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const STAFF_ID      = '550e8400-e29b-41d4-a716-446655440020'
const DEVICE_UUID   = '550e8400-e29b-41d4-a716-446655440021'
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

async function kitchenToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: '550e8400-e29b-41d4-a716-446655440099',
      role: 'kitchen',
      restaurant_id: RESTAURANT_ID,
      permissions: ['orders:accept_reject'],
      device_id: DEVICE_UUID,
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

function chain(opts: { data?: unknown; error?: unknown; count?: number } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: opts.count ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)  // no plan → no cap
  mockDeviceKv.put.mockResolvedValue(undefined)
  mockDeviceKv.get.mockResolvedValue(null)
  mockDeviceKv.delete.mockResolvedValue(undefined)
  mockInviteByEmail.mockResolvedValue({ error: null })
})

describe('STORY-021 · Staff management', () => {
  it('invite staff: users row created, Supabase invite sent', async () => {
    const fakeStaff = { id: STAFF_ID, restaurant_id: RESTAURANT_ID, role: 'kitchen', name: 'Alice', email: 'alice@test.com', permissions: ['orders:status'], active: true }
    mockFrom.mockReturnValueOnce(chain({ data: fakeStaff }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/staff/invite',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Alice', email: 'alice@test.com', permissions: ['orders:status'] }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeStaff
    expect(body.name).toBe('Alice')
    expect(mockInviteByEmail).toHaveBeenCalledWith('alice@test.com')
  })

  it('kitchen role cannot invite staff: 403', async () => {
    const token = await kitchenToken()
    const res = await app.request(
      '/admin/staff/invite',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Eve', email: 'eve@test.com', permissions: [] }),
      },
      env,
    )

    expect(res.status).toBe(403)
    expect(mockInviteByEmail).not.toHaveBeenCalled()
  })

  it('invite at staff cap: 402 plan_limit_reached', async () => {
    mockKv.get.mockResolvedValue({ staff_cap: 2 })
    mockFrom.mockReturnValueOnce(chain({ count: 2 }))  // at cap

    const token = await ownerToken()
    const res = await app.request(
      '/admin/staff/invite',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Bob', email: 'bob@test.com', permissions: [] }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; limit: number }
    expect(body.error).toBe('plan_limit_reached')
    expect(body.limit).toBe(2)
  })

  it('unknown permission: 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/staff/invite',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Charlie', email: 'c@test.com', permissions: ['orders:delete'] }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('deactivate staff: active=false, 204', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: STAFF_ID, active: false } }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/staff/${STAFF_ID}`,
      { method: 'DELETE', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(204)
    const updateArg = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArg.active).toBe(false)
  })

  it('create device: token returned, primary + index KV entries written', async () => {
    const fakeDevice = { id: STAFF_ID, name: 'Kitchen TV', device_id: DEVICE_UUID, permissions: ['orders:accept_reject', 'orders:status', 'inventory:write'], active: true }
    mockFrom.mockReturnValueOnce(chain({ data: fakeDevice }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/staff/device',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Kitchen TV' }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { device_token: string; staff: typeof fakeDevice }
    expect(body.device_token).toMatch(/^dt_[0-9a-f]{64}$/)

    // Primary key: device:{token}
    expect(mockDeviceKv.put).toHaveBeenCalledWith(
      expect.stringMatching(/^device:dt_[0-9a-f]{64}$/),
      expect.any(String),
      { expirationTtl: 7_776_000 },
    )
    // Secondary index: device_index:{restaurantId}:{deviceId}
    expect(mockDeviceKv.put).toHaveBeenCalledWith(
      expect.stringMatching(/^device_index:/),
      expect.any(String),
      { expirationTtl: 7_776_000 },
    )
  })

  it('revoke device: O(1) index lookup, both KV keys deleted, 204', async () => {
    const rawToken = 'dt_' + 'a'.repeat(64)
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: STAFF_ID, device_id: DEVICE_UUID } }))  // fetch user
      .mockReturnValueOnce(chain({ data: null }))                                        // deactivate update

    // Secondary index returns the raw token string
    mockDeviceKv.get.mockResolvedValue(rawToken)

    const token = await ownerToken()
    const res = await app.request(
      `/admin/staff/device/${DEVICE_UUID}`,
      { method: 'DELETE', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(204)
    // Primary key deleted
    expect(mockDeviceKv.delete).toHaveBeenCalledWith(`device:${rawToken}`)
    // Index key deleted
    expect(mockDeviceKv.delete).toHaveBeenCalledWith(`device_index:${RESTAURANT_ID}:${DEVICE_UUID}`)
  })
})
