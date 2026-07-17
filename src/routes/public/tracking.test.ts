import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerPublicTrackingRoutes } from './tracking'

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

const app = new Hono<HonoEnv>()
registerPublicTrackingRoutes(app)

const mockRateLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  RATE_LIMITER_TRACKING: mockRateLimiter,
} as unknown as Env

const TOKEN = 'tok_test_0000000001'
const ORDER_ID = '550e8400-e29b-41d4-a716-446655440001'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440002'

function makeOrderRow(status = 'preparing') {
  return {
    id: ORDER_ID,
    tracking_token: TOKEN,
    status,
    payment_method: 'card',
    total: 25.50,
    subtotal: 22.00,
    tax_amount: 2.50,
    promo_discount: 0,
    tip_amount: 1.00,
    created_at: '2026-07-03T10:00:00.000Z',
    scheduled_for: null,
    customer_name: 'Test Customer',
    restaurant_id: RESTAURANT_ID,
  }
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
  }
}

function itemsChain(items: unknown[] = []) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: items, error: null }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRateLimiter.limit.mockResolvedValue({ success: true })
})

describe('STORY-075 · Public tracking token-only endpoint', () => {
  it('GET /public/track/:token returns order data', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeOrderRow() }))
      .mockReturnValueOnce(chain({ data: { base_prep_minutes: 20, plan_id: 'plan-1' } }))
      .mockReturnValueOnce(chain({ data: { feature_flags: { order_tracking_page: true } } }))
      .mockReturnValueOnce(itemsChain([
        { id: 'item-1', item_id: 'menu-1', item_name: 'Burger', variant_name: null, quantity: 2, modifiers: [], notes: null },
      ]))

    const res = await app.request(`/public/track/${TOKEN}`, {}, env)

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.order_id).toBe(ORDER_ID)
    expect(body.status).toBe('preparing')
    expect(body.tracking_token).toBe(TOKEN)
    expect(body.total).toBe(25.5)
    expect(Array.isArray(body.items)).toBe(true)
    expect((body.items as unknown[]).length).toBe(1)
  })

  it('GET /public/track/:token with unknown token returns 404', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }))

    const res = await app.request('/public/track/unknown-token', {}, env)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('order_not_found')
  })

  it('GET /public/track/:token when feature flag off returns 404', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeOrderRow() }))
      .mockReturnValueOnce(chain({ data: { base_prep_minutes: 20, plan_id: 'plan-1' } }))
      .mockReturnValueOnce(chain({ data: { feature_flags: { order_tracking_page: false } } }))

    const res = await app.request(`/public/track/${TOKEN}`, {}, env)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('feature_not_available')
  })

  it('GET /public/track/:token rate limited returns 429', async () => {
    mockRateLimiter.limit.mockResolvedValue({ success: false })

    const res = await app.request(`/public/track/${TOKEN}`, {}, env)
    expect(res.status).toBe(429)
  })

  it('items have no unit_price field (SEC-010)', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeOrderRow() }))
      .mockReturnValueOnce(chain({ data: { base_prep_minutes: 20, plan_id: 'plan-1' } }))
      .mockReturnValueOnce(chain({ data: { feature_flags: { order_tracking_page: true } } }))
      .mockReturnValueOnce(itemsChain([
        { id: 'item-1', item_id: 'menu-1', item_name: 'Burger', variant_name: null, quantity: 1, modifiers: [{ name: 'Extra cheese' }], notes: null, unit_price: 9.99 },
      ]))

    const res = await app.request(`/public/track/${TOKEN}`, {}, env)
    expect(res.status).toBe(200)
    const body = await res.json() as { items: Array<Record<string, unknown>> }
    expect(body.items[0]).not.toHaveProperty('unit_price')
    expect(body.items[0]?.modifiers).toEqual([{ name: 'Extra cheese' }])
  })
})
