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

// ── Deps ──────────────────────────────────────────────────────────────────────

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

// ── UUIDs ─────────────────────────────────────────────────────────────────────

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const ITEM_ID       = '550e8400-e29b-41d4-a716-446655440002'
const GROUP_ID      = '550e8400-e29b-41d4-a716-446655440003'
const OPTION_ID     = '550e8400-e29b-41d4-a716-446655440004'
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

// ── Chain builder ─────────────────────────────────────────────────────────────

function chain(opts: { data?: unknown; error?: unknown; count?: number } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: opts.count ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

const fakeGroup = {
  id: GROUP_ID,
  item_id: ITEM_ID,
  restaurant_id: RESTAURANT_ID,
  name: 'Choose sauce',
  type: 'single',
  required: false,
  availability_state: 'available',
  sort_order: 0,
}

const fakeOption = {
  id: OPTION_ID,
  group_id: GROUP_ID,
  name: 'Ketchup',
  price_delta: 0,
  available: true,
}

beforeEach(() => {
  vi.resetAllMocks()
  // Default: plan with item_modifiers enabled, no cap
  mockKv.get.mockResolvedValue({ feature_flags: { item_modifiers: true } })
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-016 · Modifier groups & options', () => {
  it('create modifier group: 201, fields correct', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: ITEM_ID } })) // ownership check: item belongs to restaurant
      .mockReturnValueOnce(chain({ data: fakeGroup }))        // insert (no cap in plan → count skipped)

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/modifiers`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Choose sauce', type: 'single' }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeGroup
    expect(body.name).toBe('Choose sauce')
    expect(body.type).toBe('single')
  })

  it('modifier without item_modifiers flag: 402 feature_locked', async () => {
    mockKv.get.mockResolvedValue({ feature_flags: { item_modifiers: false } })

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/modifiers`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Extras', type: 'multi' }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; feature: string }
    expect(body.error).toBe('feature_locked')
    expect(body.feature).toBe('item_modifiers')
  })

  it('modifier at modifier_cap: 402 plan_limit_reached', async () => {
    mockKv.get.mockResolvedValue({ feature_flags: { item_modifiers: true }, modifier_cap: 2 })
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: ITEM_ID } })) // ownership check
      .mockReturnValueOnce(chain({ count: 2 }))               // at cap

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/modifiers`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Side dish', type: 'single' }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; limit: number; current: number }
    expect(body.error).toBe('plan_limit_reached')
    expect(body.limit).toBe(2)
    expect(body.current).toBe(2)
  })

  it('delete group: KV invalidated, 204', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }))  // delete

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/modifiers/${GROUP_ID}`,
      { method: 'DELETE', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(204)
    expect(mockKv.delete).toHaveBeenCalledWith(`menu:${RESTAURANT_ID}`)
  })

  it('price_delta = -0.50: valid, stored as -50 cents', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: GROUP_ID } }))  // verify group ownership
      .mockReturnValueOnce(chain({ data: { ...fakeOption, price_delta: -50, name: 'No sauce' } }))  // insert

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/modifiers/${GROUP_ID}/options`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'No sauce', price_delta: -0.50 }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { price_delta: number }
    expect(body.price_delta).toBe(-50)
  })

  it('type not single|multi: 422 validation error', async () => {
    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/modifiers`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Bad group', type: 'checkbox' }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })
})
