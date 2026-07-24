import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'
import { VaultError } from '../../services/secrets'

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
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
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

  it('list transactions: q searches customer name/email and, if numeric, order_number', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?q=101', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const orCall = mockFrom.mock.results[0]?.value.or.mock.calls[0]?.[0] as string
    expect(orCall).toContain('customer_name.ilike.%101%')
    expect(orCall).toContain('customer_email.ilike.%101%')
    expect(orCall).toContain('order_number.eq.101')
  })

  it('list transactions: q with letters does not add an order_number clause', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?q=jane', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const orCall = mockFrom.mock.results[0]?.value.or.mock.calls[0]?.[0] as string
    expect(orCall).not.toContain('order_number')
  })

  it('list transactions: status filter applies .in() with the parsed list', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?status=completed,refunded', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    expect(mockFrom.mock.results[0]?.value.in).toHaveBeenCalledWith('status', ['completed', 'refunded'])
  })

  it('list transactions: invalid status value: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/transactions?status=bogus', { headers: authHeaders(token) }, env)
    expect(res.status).toBe(422)
  })

  it('list transactions: payment_method filter applies .in()', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?payment_method=card', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    expect(mockFrom.mock.results[0]?.value.in).toHaveBeenCalledWith('payment_method', ['card'])
  })

  it('list transactions: from/to date range applied via gte/lte (from within the plan window)', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const token = await ownerToken()
    const res = await app.request(`/admin/transactions?from=${yesterday}&to=2099-01-31`, { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    expect(mockFrom.mock.results[0]?.value.gte).toHaveBeenCalledWith('created_at', yesterday)
    expect(mockFrom.mock.results[0]?.value.lte).toHaveBeenCalledWith('created_at', '2099-01-31')
  })

  it('list transactions: from earlier than the plan history window is clamped to the window', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [], count: 0 }))

    const token = await ownerToken()
    const res = await app.request('/admin/transactions?from=2000-01-01', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const gteArg = mockFrom.mock.results[0]?.value.gte.mock.calls[0]?.[1] as string
    expect(new Date(gteArg).getFullYear()).toBeGreaterThan(2000)
  })

  it('list transactions: malformed date: 422', async () => {
    const token = await ownerToken()
    const res = await app.request('/admin/transactions?from=not-a-date', { headers: authHeaders(token) }, env)
    expect(res.status).toBe(422)
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

  it('refund fails with a VaultError: generic detail returned, not the raw vault message', async () => {
    const order = {
      id: ORDER_ID,
      status: 'completed',
      total_cents: 2500,
      stripe_intent_id: 'pi_test_abc',
      refund_id: null,
      payment_method: 'card',
    }
    mockFrom.mockReturnValueOnce(chain({ data: order }))
    mockRefund.mockRejectedValue(new VaultError('vault.get: secret is null'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string; detail: string }
    expect(body.detail).not.toContain('vault')
    expect(body.detail).toBe('payment_configuration_error')
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('refund fails with a non-vault error: raw message still returned (unchanged behavior)', async () => {
    const order = {
      id: ORDER_ID,
      status: 'completed',
      total_cents: 2500,
      stripe_intent_id: 'pi_test_abc',
      refund_id: null,
      payment_method: 'card',
    }
    mockFrom.mockReturnValueOnce(chain({ data: order }))
    mockRefund.mockRejectedValue(new Error('stripe: card declined'))

    const token = await ownerToken()
    const res = await app.request(`/admin/transactions/${ORDER_ID}/refund`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }, env)

    expect(res.status).toBe(502)
    const body = await res.json() as { error: string; detail: string }
    expect(body.detail).toBe('stripe: card declined')
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
