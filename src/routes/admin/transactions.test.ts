import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

const mockRefund = vi.fn()

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { refundStripePayment: mockRefund })

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
const ORDER_ID      = '550e8400-e29b-41d4-a716-446655440060'
const JWT_SECRET    = 'test-secret-at-least-32-characters-long-xx'

async function ownerToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: '550e8400-e29b-41d4-a716-446655440010', role: 'restaurant_owner', restaurant_id: RESTAURANT_ID, permissions: [], device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

type ChainOpts = { data?: unknown; error?: unknown; count?: number }

function chain(opts: ChainOpts = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: opts.count ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue({ history_days: 30 })
})

describe('STORY-029 · Transaction history & refunds', () => {
  it('list transactions: paginated, returns total count', async () => {
    const txs = [{ id: ORDER_ID, status: 'completed', total_cents: 2500 }]
    mockFrom.mockReturnValueOnce(chain({ data: txs, count: 1 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?page=1', {
      method: 'GET',
      headers: authHeaders(token),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { transactions: typeof txs; total: number }
    expect(body.transactions).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('list transactions: selects full order detail including items/modifiers, not just summary fields', async () => {
    const orderRow = {
      id: ORDER_ID,
      status: 'completed',
      total: 25,
      subtotal: 22,
      tax_amount: 2,
      tip_amount: 1,
      notes: 'no onions',
      payment_method: 'card',
      items: [{ id: 'item-1', item_name: 'Burger', modifiers: [{ name: 'Extra cheese' }], notes: null }],
    }
    mockFrom.mockReturnValueOnce(chain({ data: [orderRow], count: 1 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?page=1', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { transactions: Array<typeof orderRow> }
    expect(body.transactions[0]).toHaveProperty('tax_amount', 2)
    expect(body.transactions[0]).toHaveProperty('tip_amount', 1)
    expect(body.transactions[0]).toHaveProperty('notes', 'no onions')
    expect(body.transactions[0]?.items).toHaveLength(1)
    expect(body.transactions[0]?.items[0]?.modifiers).toEqual([{ name: 'Extra cheese' }])

    // Confirm the actual SELECT string requests the full row + items join,
    // not the old narrow field list.
    const selectCall = mockFrom.mock.results[0]?.value.select.mock.calls[0]?.[0] as string
    expect(selectCall).toContain('items:order_items(*)')
  })

  it('get single order: found', async () => {
    const order = { id: ORDER_ID, status: 'completed', total_cents: 2500, restaurant_id: RESTAURANT_ID }
    mockFrom.mockReturnValueOnce(chain({ data: order }))

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}`, {
      method: 'GET',
      headers: authHeaders(token),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as typeof order
    expect(body.id).toBe(ORDER_ID)
  })

  it('get non-existent order: 404', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: { message: 'not found' } }))

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}`, {
      method: 'GET',
      headers: authHeaders(token),
    }, env)
    expect(res.status).toBe(404)
  })

  it('refund completed order: Stripe called, status → refunded', async () => {
    const order = {
      id: ORDER_ID,
      status: 'completed',
      total_cents: 2500,
      stripe_intent_id: 'pi_test_abc',
      refund_id: null,
      payment_method: 'card',
    }
    const updated = { ...order, status: 'refunded', refund_id: 're_test_123', refunded_at: new Date().toISOString() }

    mockFrom
      .mockReturnValueOnce(chain({ data: order }))   // get order
      .mockReturnValueOnce(chain({ data: updated })) // update

    mockRefund.mockResolvedValue({ id: 're_test_123' })

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as typeof updated
    expect(body.status).toBe('refunded')
    expect(body.refund_id).toBe('re_test_123')
    expect(mockRefund).toHaveBeenCalledWith('pi_test_abc', undefined)
  })

  it('refund already-refunded order: 409', async () => {
    const order = {
      id: ORDER_ID,
      status: 'refunded',
      payment_intent_id: 'pi_test_abc',
      refund_id: 're_existing',
      payment_method: 'card',
      total_cents: 2500,
    }
    mockFrom.mockReturnValueOnce(chain({ data: order }))

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(409)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('already_refunded')
  })

  it('refund pending order: 422 order_not_refundable', async () => {
    const order = {
      id: ORDER_ID,
      status: 'pending_payment',
      payment_intent_id: 'pi_test_abc',
      refund_id: null,
      payment_method: 'card',
      total_cents: 2500,
    }
    mockFrom.mockReturnValueOnce(chain({ data: order }))

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('order_not_refundable')
  })
})
