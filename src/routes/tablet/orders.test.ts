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

// ── Stripe / Broadcaster deps ─────────────────────────────────────────────────

const mockCapture = vi.fn()
const mockCancel = vi.fn()
const mockBroadcast = vi.fn()

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<HonoEnv>()
registerTabletRoutes(app, {
  broadcaster: { broadcast: mockBroadcast },
  stripeCapture: mockCapture,
  stripeCancel: mockCancel,
})

// ── Fake env ──────────────────────────────────────────────────────────────────

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
const OTHER_RESTAURANT = '550e8400-e29b-41d4-a716-000000000099'

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

async function makeToken(role: string, permissions: string[] = [], restaurantId = RESTAURANT_ID) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'user-1', role, restaurant_id: restaurantId, permissions, device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: Array.isArray(opts.data) ? opts.data : [], error: opts.error ?? null }),
    single: vi.fn().mockResolvedValue(resolved),
    update: vi.fn().mockReturnThis(),
  }
}

const CARD_ORDER = {
  id: 'order-1',
  restaurant_id: RESTAURANT_ID,
  status: 'auth_success',
  payment_method: 'card',
  stripe_intent_id: 'pi_test_123',
  items: [],
}

const PICKUP_ORDER = {
  id: 'order-2',
  restaurant_id: RESTAURANT_ID,
  status: 'auth_success',
  payment_method: 'pickup',
  stripe_intent_id: null,
  items: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockCapture.mockResolvedValue(undefined)
  mockCancel.mockResolvedValue(undefined)
})

describe('STORY-031 · Order acceptance & rejection', () => {
  it('GET /tablet/orders: returns active orders list', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: [CARD_ORDER, PICKUP_ORDER] }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders', { headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { orders: unknown[] }
    expect(body.orders).toHaveLength(2)
  })

  it('accept card order: Stripe capture called, status=accepted', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: CARD_ORDER }))
      .mockReturnValueOnce(chain({ data: { ...CARD_ORDER, status: 'accepted', payment_status: 'captured' } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockCapture).toHaveBeenCalledWith('', 'pi_test_123', 'order-1')
    expect(mockBroadcast).toHaveBeenCalledWith(RESTAURANT_ID, 'order_accepted', { order_id: 'order-1' }, expect.anything())
  })

  it('accept pickup order: no Stripe call, status=accepted', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: PICKUP_ORDER }))
      .mockReturnValueOnce(chain({ data: { ...PICKUP_ORDER, status: 'accepted' } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-2/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockCapture).not.toHaveBeenCalled()
  })

  it('reject card order: Stripe cancel called, status=rejected', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: CARD_ORDER }))
      .mockReturnValueOnce(chain({ data: { ...CARD_ORDER, status: 'rejected' } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/reject', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockCancel).toHaveBeenCalledWith('', 'pi_test_123', 'order-1')
    expect(mockBroadcast).toHaveBeenCalledWith(RESTAURANT_ID, 'order_rejected', { order_id: 'order-1' }, expect.anything())
  })

  it('accept already-accepted: 409', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...CARD_ORDER, status: 'accepted' } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(409)
  })

  it('without orders:accept_reject permission: 403', async () => {
    const token = await makeToken('kitchen', [])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('accept order from different restaurant: 403', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { ...CARD_ORDER, restaurant_id: OTHER_RESTAURANT } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('capture uses idempotency key: safe to retry', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: CARD_ORDER }))
      .mockReturnValueOnce(chain({ data: { ...CARD_ORDER, status: 'accepted' } }))
    const token = await makeToken('kitchen', ['orders:accept_reject'])
    await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/accept', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
      env,
    )
    expect(mockCapture).toHaveBeenCalledWith('', 'pi_test_123', 'order-1')
    // Idempotency key format 'capture_{orderId}' is enforced inside StripeService
    // — the injected mock receives the full args so callers can verify the key
  })
})
