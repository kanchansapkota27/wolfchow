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

const mockTestSmtpConnection = vi.fn()
const mockSealSmtpPassword   = vi.fn()
const mockSendTestEmail      = vi.fn()

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, {
  testSmtpConnection: mockTestSmtpConnection,
  sealSmtpPassword:   mockSealSmtpPassword,
  sendTestEmail:      mockSendTestEmail,
})

// ── Fake env ──────────────────────────────────────────────────────────────────

const mockKv      = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }
const mockSmtpKv  = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  SMTP_COUNTERS: mockSmtpKv,
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

const VALID_SMTP_BODY = {
  host: 'smtp.example.com',
  port: 587,
  username: 'user@example.com',
  password: 'secret123',
  from_email: 'orders@example.com',
  from_name: 'My Restaurant',
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null, count: null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.get.mockResolvedValue(null)
  mockSmtpKv.get.mockResolvedValue(null)
  mockTestSmtpConnection.mockResolvedValue(undefined)  // success by default
  mockSealSmtpPassword.mockResolvedValue('encrypted-password-blob')
  mockSendTestEmail.mockResolvedValue(undefined)
})

describe('STORY-023 · SMTP configuration', () => {
  it('POST /admin/smtp: password encrypted, test email sent, config saved', async () => {
    const savedConfig = { host: 'smtp.example.com', port: 587, username: 'user@example.com', from_email: 'orders@example.com', from_name: 'My Restaurant', updated_at: new Date().toISOString() }
    mockFrom
      .mockReturnValueOnce(chain({ data: { email: 'owner@example.com' } }))  // fetch user email
      .mockReturnValueOnce(chain({ data: savedConfig }))                       // upsert smtp_config

    const token = await ownerToken()
    const res = await app.request(
      '/admin/smtp',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(VALID_SMTP_BODY),
      },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>

    // Password must never appear in response
    expect(JSON.stringify(body)).not.toContain('password')
    expect(body.smtp_source).toBe('own')
    expect(body.monthly_limit).toBeNull()

    // Seal was called with plaintext password
    expect(mockSealSmtpPassword).toHaveBeenCalledWith('secret123', RESTAURANT_ID)

    // Test connection was called before saving
    expect(mockTestSmtpConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', password: 'secret123' }),
      'owner@example.com',
    )

    // Upsert stored encrypted blob, not plaintext
    const upsertArg = mockFrom.mock.results[1]?.value.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(upsertArg.encrypted_password).toBe('encrypted-password-blob')
    expect(upsertArg).not.toHaveProperty('password')
  })

  it('bad SMTP credentials: testSmtpConnection throws → 422', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { email: 'owner@example.com' } }))
    mockTestSmtpConnection.mockRejectedValue(new Error('authentication failed'))

    const token = await ownerToken()
    const res = await app.request(
      '/admin/smtp',
      {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(VALID_SMTP_BODY),
      },
      env,
    )

    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; detail: string }
    expect(body.error).toBe('smtp_connection_failed')
    expect(body.detail).toBe('authentication failed')
    // Nothing saved
    expect(mockSealSmtpPassword).not.toHaveBeenCalled()
  })

  it('GET /admin/smtp: password absent, smtp_source=own when own row exists', async () => {
    const ownRow = { host: 'smtp.example.com', port: 587, username: 'u@x.com', from_email: 'o@x.com', from_name: 'Rest', updated_at: new Date().toISOString() }
    mockFrom.mockReturnValueOnce(chain({ data: ownRow }))
    mockSmtpKv.get.mockResolvedValue('5')  // 5 emails used this month

    const token = await ownerToken()
    const res = await app.request('/admin/smtp', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.smtp_source).toBe('own')
    expect(body.monthly_limit).toBeNull()
    expect(body.monthly_used).toBe(5)
    expect(JSON.stringify(body)).not.toContain('password')
    expect(JSON.stringify(body)).not.toContain('encrypted')
  })

  it('GET /admin/smtp: smtp_source=global when no own row, monthly_limit from plan', async () => {
    const globalRow = { host: 'smtp.platform.com', port: 465, username: 'noreply@platform.com', from_email: 'noreply@platform.com', from_name: 'Platform', updated_at: new Date().toISOString() }
    mockFrom
      .mockReturnValueOnce(chain({ data: null }))   // no own config
      .mockReturnValueOnce(chain({ data: globalRow }))  // global config
    mockKv.get.mockResolvedValue({ smtp_monthly_limit: 200 })

    const token = await ownerToken()
    const res = await app.request('/admin/smtp', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.smtp_source).toBe('global')
    expect(body.monthly_limit).toBe(200)
    expect(body.monthly_used).toBe(0)
  })

  it('DELETE /admin/smtp: own row removed, 204', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null }))

    const token = await ownerToken()
    const res = await app.request('/admin/smtp', { method: 'DELETE', headers: authHeaders(token) }, env)

    expect(res.status).toBe(204)
    const deleteCalled = mockFrom.mock.results[0]?.value.delete.mock.calls.length
    expect(deleteCalled).toBe(1)
  })
})
