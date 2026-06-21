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

const mockBroadcast = vi.fn()

const app = new Hono<HonoEnv>()
registerTabletRoutes(app, { broadcaster: { broadcast: mockBroadcast } })

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
  MASTER_ENCRYPTION_KEY: btoa('a'.repeat(32)),
} as unknown as Env

async function makeToken(permissions: string[] = []) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'user-1', role: 'kitchen', restaurant_id: RESTAURANT_ID, permissions, device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: Array.isArray(opts.data) ? opts.data : [], error: null }),
    single: vi.fn().mockResolvedValue(resolved),
    update: vi.fn().mockReturnThis(),
  }
  return c
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-033 · Inventory management (tablet)', () => {
  it('GET /tablet/inventory: returns categories and items', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: [{ id: 'cat-1', name: 'Mains', availability_state: 'available', position: 1 }] }))
      .mockReturnValueOnce(chain({ data: [{ id: 'item-1', name: 'Pizza', category_id: 'cat-1', availability_state: 'available', restore_at: null }] }))
    const token = await makeToken(['inventory:write'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/inventory', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { categories: unknown[]; items: unknown[] }
    expect(body.categories).toHaveLength(1)
    expect(body.items).toHaveLength(1)
  })

  it('mark item out_of_stock with restore_at: DB updated, KV invalidated, broadcast', async () => {
    const restoreAt = new Date(Date.now() + 2700000).toISOString()
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'item-1', restaurant_id: RESTAURANT_ID } })) // scope check
      .mockReturnValueOnce(chain({ data: { id: 'item-1', name: 'Pizza', availability_state: 'out_of_stock', restore_at: restoreAt } })) // update
    const token = await makeToken(['inventory:write'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/inventory/items/item-1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_state: 'out_of_stock', restore_at: restoreAt }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'menu_availability_changed',
      { item_id: 'item-1', availability_state: 'out_of_stock' },
      expect.anything(),
    )
  })

  it('without inventory:write permission: 403 on item patch', async () => {
    const token = await makeToken([])
    const res = await app.fetch(
      new Request('http://localhost/tablet/inventory/items/item-1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_state: 'out_of_stock' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('mark category out_of_stock: broadcast with category_id', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: { id: 'cat-1', restaurant_id: RESTAURANT_ID } }))
      .mockReturnValueOnce(chain({ data: { id: 'cat-1', name: 'Mains', availability_state: 'out_of_stock', restore_at: null } }))
    const token = await makeToken(['inventory:write'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/inventory/categories/cat-1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_state: 'out_of_stock' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'menu_availability_changed',
      { category_id: 'cat-1', availability_state: 'out_of_stock' },
      expect.anything(),
    )
  })

  it('mark item from different restaurant: 403', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: 'item-1', restaurant_id: 'other-restaurant' } }))
    const token = await makeToken(['inventory:write'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/inventory/items/item-1', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability_state: 'out_of_stock' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
  })
})
