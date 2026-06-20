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

// ── Injectable deps ───────────────────────────────────────────────────────────

const mockVerifyStripeKey = vi.fn()
const mockSealStripeKey   = vi.fn()

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { verifyStripeKey: mockVerifyStripeKey, sealStripeKey: mockSealStripeKey })

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

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'
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

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockKv.delete.mockResolvedValue(undefined)
  mockVerifyStripeKey.mockResolvedValue(true)
  mockSealStripeKey.mockResolvedValue('encrypted-blob-base64')
})

describe('STORY-022 · Payment configuration', () => {
  it('store valid Stripe key: encrypted in DB, plaintext absent from response', async () => {
    const savedAt = new Date().toISOString()
    mockFrom.mockReturnValueOnce(
      chain({ data: { stripe_publishable_key: 'pk_test_abc', updated_at: savedAt } }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/payments/stripe',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ secret_key: 'sk_test_validkey', publishable_key: 'pk_test_abc' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>

    // Secret key must NEVER appear in the response
    expect(JSON.stringify(body)).not.toContain('sk_test_')
    expect(body.has_secret).toBe(true)
    expect(body.publishable_key).toBe('pk_test_abc')

    // seal was called with the plaintext key
    expect(mockSealStripeKey).toHaveBeenCalledWith('sk_test_validkey', RESTAURANT_ID)

    // Upsert wrote the encrypted blob, not the plaintext
    const upsertArg = mockFrom.mock.results[0]?.value.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(upsertArg.encrypted_stripe_secret).toBe('encrypted-blob-base64')
    expect(upsertArg).not.toHaveProperty('secret_key')
  })

  it('invalid key format (no sk_live_/sk_test_ prefix): 422, Stripe API not called', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/payments/stripe',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ secret_key: 'rk_test_invalid', publishable_key: 'pk_test_abc' }),
      },
      env,
    )

    expect(res.status).toBe(422)
    expect(mockVerifyStripeKey).not.toHaveBeenCalled()
  })

  it('Stripe API rejects key: 422', async () => {
    mockVerifyStripeKey.mockResolvedValue(false)

    const token = await ownerToken()
    const res = await app.request(
      '/admin/payments/stripe',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ secret_key: 'sk_test_badkey', publishable_key: 'pk_test_abc' }),
      },
      env,
    )

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; code: string }
    expect(body.error).toBe('invalid_stripe_key')
    expect(mockSealStripeKey).not.toHaveBeenCalled()
  })

  it('GET stripe config: encrypted_stripe_secret absent from response, has_secret reflects presence', async () => {
    const savedAt = new Date().toISOString()
    mockFrom.mockReturnValueOnce(
      chain({ data: { stripe_publishable_key: 'pk_test_abc', encrypted_stripe_secret: 'some-encrypted-blob', updated_at: savedAt } }),
    )

    const token = await ownerToken()
    const res = await app.request('/admin/payments/stripe', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(JSON.stringify(body)).not.toContain('encrypted_stripe_secret')
    expect(JSON.stringify(body)).not.toContain('sk_')
    expect(body.has_secret).toBe(true)
    expect(body.publishable_key).toBe('pk_test_abc')
  })

  it('enable payment method disallowed by Starter plan: 402', async () => {
    mockKv.get.mockResolvedValue({ payment_methods_allowed: ['cash', 'card'] })

    const token = await ownerToken()
    const res = await app.request(
      '/admin/payments/methods',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ payment_methods: ['cash', 'card', 'pickup'] }),
      },
      env,
    )

    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; disallowed: string[] }
    expect(body.error).toBe('plan_limit_reached')
    expect(body.disallowed).toContain('pickup')
  })

  it('PATCH methods: KV invalidated after update', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { payment_methods: ['cash', 'card'], updated_at: new Date().toISOString() } }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/payments/methods',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ payment_methods: ['cash', 'card'] }),
      },
      env,
    )

    expect(res.status).toBe(200)
    expect(mockKv.delete).toHaveBeenCalledWith(`settings:${RESTAURANT_ID}`)
  })
})
