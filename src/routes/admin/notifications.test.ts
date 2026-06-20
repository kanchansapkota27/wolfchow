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

const mockSendPreviewEmail = vi.fn()

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { sendPreviewEmail: mockSendPreviewEmail })

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
const OWNER_ID      = '550e8400-e29b-41d4-a716-446655440010'
const JWT_SECRET    = 'test-secret-at-least-32-characters-long-xx'

async function ownerToken() {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: OWNER_ID,
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
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

// chain that resolves directly (for queries without .single())
function chainDirect(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: null }
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
  return c
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockSendPreviewEmail.mockResolvedValue(undefined)
})

describe('STORY-024 · Notification configuration', () => {
  it('PUT: all 8 statuses stored, returns saved configs', async () => {
    const configs = [
      { trigger_status: 'auth_success', send_customer: true, internal_recipients: [], template_override: null },
      { trigger_status: 'accepted', send_customer: true, internal_recipients: ['chef@rest.com'], template_override: null },
      { trigger_status: 'preparing', send_customer: false, internal_recipients: [], template_override: null },
      { trigger_status: 'ready', send_customer: true, internal_recipients: [], template_override: null },
      { trigger_status: 'completed', send_customer: false, internal_recipients: [], template_override: null },
      { trigger_status: 'rejected', send_customer: true, internal_recipients: [], template_override: null },
      { trigger_status: 'missed', send_customer: true, internal_recipients: [], template_override: null },
      { trigger_status: 'refunded', send_customer: true, internal_recipients: [], template_override: null },
    ]
    mockFrom.mockReturnValueOnce(chainDirect({ data: configs }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/notifications',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(configs),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { notifications: unknown[] }
    expect(body.notifications).toHaveLength(8)
  })

  it('invalid trigger_status: 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/notifications',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify([{ trigger_status: 'unknown_event', send_customer: true, internal_recipients: [] }]),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('invalid email in internal_recipients: 422', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/notifications',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify([{ trigger_status: 'accepted', send_customer: true, internal_recipients: ['not-an-email'] }]),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('send_customer=false for rejected: 422 customer_notification_required', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/notifications',
      {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify([{ trigger_status: 'rejected', send_customer: false, internal_recipients: [] }]),
      },
      env,
    )

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; trigger_status: string }
    expect(body.error).toBe('customer_notification_required')
    expect(body.trigger_status).toBe('rejected')
  })

  it('GET: missing rows filled with defaults, 10 statuses returned', async () => {
    // Only 2 rows in DB
    const dbRows = [
      { trigger_status: 'accepted', send_customer: false, internal_recipients: ['chef@rest.com'], template_override: null },
      { trigger_status: 'ready', send_customer: true, internal_recipients: [], template_override: null },
    ]
    mockFrom.mockReturnValueOnce(chainDirect({ data: dbRows }))

    const token = await ownerToken()
    const res = await app.request('/admin/notifications', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { notifications: { trigger_status: string; send_customer: boolean }[] }
    expect(body.notifications).toHaveLength(10)

    // Saved row overrides default
    const accepted = body.notifications.find((n) => n.trigger_status === 'accepted')
    expect(accepted?.send_customer).toBe(false)

    // Default for auth_success is true
    const authSuccess = body.notifications.find((n) => n.trigger_status === 'auth_success')
    expect(authSuccess?.send_customer).toBe(true)

    // Default for preparing is false
    const preparing = body.notifications.find((n) => n.trigger_status === 'preparing')
    expect(preparing?.send_customer).toBe(false)
  })

  it('preview email: sent to admin email', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { email: 'owner@rest.com' } }))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/notifications/preview/accepted',
      { method: 'POST', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { sent_to: string; status: string }
    expect(body.sent_to).toBe('owner@rest.com')
    expect(body.status).toBe('accepted')
    expect(mockSendPreviewEmail).toHaveBeenCalledWith(RESTAURANT_ID, 'accepted', 'owner@rest.com')
  })
})
