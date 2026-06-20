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

// ── Broadcaster mock ──────────────────────────────────────────────────────────

const mockBroadcast = vi.fn()
const broadcaster = { broadcast: mockBroadcast }

// ── App setup ─────────────────────────────────────────────────────────────────

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { broadcaster })

// ── Fake env ──────────────────────────────────────────────────────────────────

const mockKv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  MEDIA_BUCKET: {},
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'media',
} as unknown as Env

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const CATEGORY_ID = '550e8400-e29b-41d4-a716-446655440002'
const CATEGORY_ID_2 = '550e8400-e29b-41d4-a716-446655440003'
const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'

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

// Supabase fluent chain builder — handles both query and count scenarios
function chain(opts: {
  data?: unknown
  error?: unknown
  count?: number
}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: opts.count ?? null }
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
  return c
}

const fakeCategory = {
  id: CATEGORY_ID,
  restaurant_id: RESTAURANT_ID,
  name: 'Burgers',
  sort_order: 0,
  active: true,
  availability_state: 'available' as const,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null) // no plan in KV by default → no cap
  mockKv.delete.mockResolvedValue(undefined)
})

describe('STORY-014 · Menu categories', () => {
  it('create category: 201, category returned', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: fakeCategory }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/categories',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Burgers' }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeCategory
    expect(body.name).toBe('Burgers')
    expect(body.restaurant_id).toBe(RESTAURANT_ID)
  })

  it('create at plan cap: 402 with limit and current', async () => {
    // plan KV returns a cap of 2 (KvCache.get uses kv.get(key, 'json') which returns parsed object)
    mockKv.get.mockResolvedValue({ category_cap: 2 })
    // count query returns 2 existing active categories
    mockFrom.mockReturnValueOnce(chain({ count: 2 }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/categories',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Desserts' }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; limit: number; current: number }
    expect(body.error).toBe('plan_limit_reached')
    expect(body.limit).toBe(2)
    expect(body.current).toBe(2)
  })

  it('reorder: sort_orders updated for all items', async () => {
    // Two update calls, one per category
    mockFrom
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(chain({ data: null }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/categories/reorder',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify([
          { id: CATEGORY_ID, sort_order: 1 },
          { id: CATEGORY_ID_2, sort_order: 2 },
        ]),
      },
      env,
    )

    expect(res.status).toBe(204)
    // Both rows updated
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('delete with active items: 409 with item_count', async () => {
    // item count check returns 3 items
    mockFrom.mockReturnValueOnce(chain({ count: 3 }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/categories/${CATEGORY_ID}`,
      {
        method: 'DELETE',
        headers: authHeaders(token),
      },
      env,
    )

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string; item_count: number }
    expect(body.error).toBe('category_has_items')
    expect(body.item_count).toBe(3)
  })

  it('delete empty category: soft-deleted (active=false), 204', async () => {
    // item count = 0
    mockFrom.mockReturnValueOnce(chain({ count: 0 }))
    // soft-delete update
    mockFrom.mockReturnValueOnce(chain({ data: { ...fakeCategory, active: false } }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/categories/${CATEGORY_ID}`,
      {
        method: 'DELETE',
        headers: authHeaders(token),
      },
      env,
    )

    expect(res.status).toBe(204)
    // Verify soft-delete: update called with active: false
    const updateArgs = mockFrom.mock.results[1]?.value.update.mock.calls[0]?.[0]
    expect(updateArgs).toEqual({ active: false })
  })

  it('KV menu: key invalidated after write, broadcast called', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: fakeCategory }))

    const token = await ownerToken()
    await app.request(
      '/admin/menu/categories',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Drinks' }),
      },
      env,
    )

    // menu:{restaurant_id} deleted
    expect(mockKv.delete).toHaveBeenCalledWith(`menu:${RESTAURANT_ID}`)
    // broadcaster called with correct event
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'menu_availability_changed',
      {},
      expect.anything(),
    )
  })
})
