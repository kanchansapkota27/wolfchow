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
const mockUploadUrl = vi.fn(async (_env: unknown, key: string) => `https://r2.test/${key}`)

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, {
  broadcaster: { broadcast: mockBroadcast },
  generateUploadUrl: mockUploadUrl,
})

// ── Fake env ──────────────────────────────────────────────────────────────────

const mockKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
// Distinct from mockKv/SETTINGS_CACHE: the public menu route reads/writes the
// 'menu:' cache key via MENU_CACHE specifically (src/routes/public/menu.ts) —
// keeping these separate here so a regression (invalidating the wrong
// binding) fails this suite instead of passing unnoticed.
const mockMenuKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  MENU_CACHE: mockMenuKv,
  MEDIA_BUCKET: {},
  R2_ACCOUNT_ID: 'acc', R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'media',
} as unknown as Env

// ── UUIDs (proper RFC 4122 v4 format for Zod v4 compatibility) ────────────────

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const ITEM_ID       = '550e8400-e29b-41d4-a716-446655440002'
const CATEGORY_ID   = '550e8400-e29b-41d4-a716-446655440003'
const VARIANT_ID    = '550e8400-e29b-41d4-a716-446655440004'
const VARIANT_ID_2  = '550e8400-e29b-41d4-a716-446655440005'
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
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

const fakeItem = {
  id: ITEM_ID,
  restaurant_id: RESTAURANT_ID,
  category_id: CATEGORY_ID,
  name: 'Classic Burger',
  description: 'Beef patty',
  price: 1200,
  availability_state: 'available',
  active: true,
  has_variants: false,
  tags: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue({}) // empty plan from KV → no cap, no feature lock
  mockKv.delete.mockResolvedValue(undefined)
  mockMenuKv.delete.mockResolvedValue(undefined)
})

describe('STORY-015 · Menu items', () => {
  // ── Item CRUD ───────────────────────────────────────────────────────────────

  it('create item: 201, fields correct', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: fakeItem }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Classic Burger',
          price: 12.00,
          category_id: CATEGORY_ID,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as typeof fakeItem
    expect(body.name).toBe('Classic Burger')
    expect(body.restaurant_id).toBe(RESTAURANT_ID)
  })

  it('create item with special_requests_enabled=false: 201, persisted', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...fakeItem, special_requests_enabled: false } }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Classic Burger',
          price: 12.00,
          category_id: CATEGORY_ID,
          special_requests_enabled: false,
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { special_requests_enabled: boolean }
    expect(body.special_requests_enabled).toBe(false)

    const insertArgs = mockFrom.mock.results[0]?.value.insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertArgs.special_requests_enabled).toBe(false)
  })

  it('PATCH item special_requests_enabled=null: reverts to restaurant default', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...fakeItem, special_requests_enabled: null } }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ special_requests_enabled: null }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const updateArgs = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).toHaveProperty('special_requests_enabled', null)
  })

  it('create at item cap: 402 with limit and current', async () => {
    mockKv.get.mockResolvedValue({ item_cap: 3 })
    mockFrom.mockReturnValueOnce(chain({ count: 3 })) // count query hits cap

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Extra Item', price: 9.99, category_id: CATEGORY_ID }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; limit: number; current: number }
    expect(body.error).toBe('plan_limit_reached')
    expect(body.limit).toBe(3)
    expect(body.current).toBe(3)
  })

  it('price = 0: 422 validation error', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Free Item', price: 0, category_id: CATEGORY_ID }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('price negative: 422 validation error', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Negative Item', price: -5, category_id: CATEGORY_ID }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('create item with tags=[vegan,spicy]: 201, stored', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...fakeItem, tags: ['vegan', 'spicy'] } }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Spicy Veggie',
          price: 10.50,
          category_id: CATEGORY_ID,
          tags: ['vegan', 'spicy'],
        }),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { tags: string[] }
    expect(body.tags).toEqual(['vegan', 'spicy'])
  })

  it('create item with unknown tag "keto": 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/menu/items',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          name: 'Keto Burger',
          price: 14.00,
          category_id: CATEGORY_ID,
          tags: ['keto'],
        }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  // ── Image upload ────────────────────────────────────────────────────────────

  it('image URL without menu_photos flag: 402 feature_locked', async () => {
    // plan exists but menu_photos = false
    mockKv.get.mockResolvedValue({ feature_flags: { menu_photos: false } })

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/image`,
      { method: 'POST', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; feature: string }
    expect(body.error).toBe('feature_locked')
    expect(body.feature).toBe('menu_photos')
  })

  it('image URL with menu_photos flag: presigned URL with correct path', async () => {
    mockKv.get.mockResolvedValue({ feature_flags: { menu_photos: true } })

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/image`,
      { method: 'POST', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { upload_url: string; r2_key: string }
    expect(body.r2_key).toMatch(
      new RegExp(`^${RESTAURANT_ID}/${ITEM_ID}/[a-z0-9]{21}\\.webp$`),
    )
    expect(body.upload_url).toContain(body.r2_key)
  })

  it('PATCH item with image_r2_key: persisted after a valid own-item key', async () => {
    const key = `${RESTAURANT_ID}/${ITEM_ID}/abc123.webp`
    mockFrom.mockReturnValueOnce(chain({ data: { ...fakeItem, image_r2_key: key } }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}`,
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ image_r2_key: key }) },
      env,
    )

    expect(res.status).toBe(200)
    const updateArgs = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).toHaveProperty('image_r2_key', key)
  })

  it('PATCH item with image_r2_key: rejects a key scoped to a different item (IDOR)', async () => {
    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}`,
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ image_r2_key: `${RESTAURANT_ID}/some-other-item-id/abc123.webp` }) },
      env,
    )

    expect(res.status).toBe(422)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PATCH item with image_r2_key: rejects a key scoped to a different restaurant (IDOR)', async () => {
    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}`,
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ image_r2_key: `some-other-restaurant/${ITEM_ID}/abc123.webp` }) },
      env,
    )

    expect(res.status).toBe(422)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  // ── Availability ────────────────────────────────────────────────────────────

  it('set out_of_stock with restore_at: stored, KV invalidated', async () => {
    const updatedItem = { ...fakeItem, availability_state: 'out_of_stock', restore_at: '2026-12-01T10:00:00.000Z' }
    mockFrom.mockReturnValueOnce(chain({ data: updatedItem }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/availability`,
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ state: 'out_of_stock', restore_at: '2026-12-01T10:00:00.000Z' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { availability_state: string }
    expect(body.availability_state).toBe('out_of_stock')
    expect(mockMenuKv.delete).toHaveBeenCalledWith(`menu:${RESTAURANT_ID}`)
  })

  // ── Variants ────────────────────────────────────────────────────────────────

  it('add first variant: has_variants becomes true on parent item', async () => {
    const fakeVariant = { id: VARIANT_ID, item_id: ITEM_ID, name: 'Regular', price: 1000, is_default: true, available: true, sort_order: 0 }

    mockFrom
      .mockReturnValueOnce(chain({ data: { id: ITEM_ID } })) // ownership check: item belongs to restaurant
      .mockReturnValueOnce(chain({ count: 0 }))              // count existing variants → 0 (first)
      .mockReturnValueOnce(chain({ data: null }))            // unset sibling defaults (is_default=true triggers this)
      .mockReturnValueOnce(chain({ data: fakeVariant }))     // insert variant
      .mockReturnValueOnce(chain({ data: null }))            // set has_variants = true on item

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/variants`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Regular', price: 10.00, is_default: true }),
      },
      env,
    )

    expect(res.status).toBe(201)
    // Verify has_variants update was called
    const updateCalls = mockFrom.mock.results
      .map((r) => r.value.update?.mock?.calls?.[0]?.[0])
      .filter(Boolean) as Record<string, unknown>[]
    expect(updateCalls.some((c) => c.has_variants === true)).toBe(true)
  })

  it('add variant with is_default=true: unsets default on siblings', async () => {
    const fakeVariant = { id: VARIANT_ID_2, item_id: ITEM_ID, name: 'Large', price: 1500, is_default: true, available: true, sort_order: 1 }

    mockFrom
      .mockReturnValueOnce(chain({ data: { id: ITEM_ID } })) // ownership check
      .mockReturnValueOnce(chain({ count: 1 }))              // count existing → 1 (not first)
      .mockReturnValueOnce(chain({ data: null }))            // unset existing defaults
      .mockReturnValueOnce(chain({ data: fakeVariant }))     // insert new variant

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/variants`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'Large', price: 15.00, is_default: true }),
      },
      env,
    )

    expect(res.status).toBe(201)
    // Verify "unset defaults" update was called with is_default: false
    const updateCalls = mockFrom.mock.results
      .map((r) => r.value?.update?.mock?.calls?.[0]?.[0])
      .filter(Boolean) as Record<string, unknown>[]
    expect(updateCalls.some((c) => c.is_default === false)).toBe(true)
  })

  it('delete last variant: 409 last_variant', async () => {
    const fakeVariant = { item_id: ITEM_ID, is_default: false, sort_order: 0 }

    mockFrom
      .mockReturnValueOnce(chain({ data: fakeVariant })) // fetch variant
      .mockReturnValueOnce(chain({ count: 0 }))          // count siblings → 0 (last)

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/variants/${VARIANT_ID}`,
      { method: 'DELETE', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('last_variant')
  })

  it('delete default variant with siblings: next sort_order becomes default', async () => {
    const fakeVariant = { item_id: ITEM_ID, is_default: true, sort_order: 0 }
    const nextVariant = { id: VARIANT_ID_2 }

    mockFrom
      .mockReturnValueOnce(chain({ data: fakeVariant }))  // fetch variant being deleted
      .mockReturnValueOnce(chain({ count: 1 }))           // count siblings → 1
      .mockReturnValueOnce(chain({ data: nextVariant }))  // find next variant
      .mockReturnValueOnce(chain({ data: null }))         // promote next to default
      .mockReturnValueOnce(chain({ data: null }))         // delete variant

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/variants/${VARIANT_ID}`,
      { method: 'DELETE', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(204)
    // Verify promotion: update called with is_default: true on the next variant
    const updateCalls = mockFrom.mock.results
      .map((r) => r.value?.update?.mock?.calls?.[0]?.[0])
      .filter(Boolean) as Record<string, unknown>[]
    expect(updateCalls.some((c) => c.is_default === true)).toBe(true)
  })

  it('reorder variants: sort_orders updated, 204', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(chain({ data: null }))

    const token = await ownerToken()
    const res = await app.request(
      `/admin/menu/items/${ITEM_ID}/variants/reorder`,
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify([
          { id: VARIANT_ID, sort_order: 0 },
          { id: VARIANT_ID_2, sort_order: 1 },
        ]),
      },
      env,
    )

    expect(res.status).toBe(204)
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })
})
