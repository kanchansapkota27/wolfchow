import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAuthRoutes } from './index'

// ── Mock supabase service ──────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockCreateUser = vi.fn()
const mockDeleteUser = vi.fn()
const mockSignIn = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
      },
    },
  }),
  createAnonClient: () => ({
    auth: {
      signInWithPassword: mockSignIn,
    },
  }),
}))

// ── App setup ────────────────────────────────────────────────────────────

const app = new Hono<HonoEnv>()
registerAuthRoutes(app)

const PLAN_ID = 'plan-uuid-1'
const RESTAURANT_ID = 'rest-uuid-1'
const USER_ID = 'user-uuid-1'
const EXPIRES_FUTURE = new Date(Date.now() + 72 * 3600_000).toISOString()
const EXPIRES_PAST = new Date(Date.now() - 1000).toISOString()

const fakePlan = {
  id: PLAN_ID,
  name: 'Starter',
  device_cap: 5,
  item_cap: 50,
  category_cap: 10,
  modifier_cap: 20,
  smtp_monthly_limit: null,
  transaction_history_days: null,
  feature_flags: { menu_photos: false, item_modifiers: false },
  payment_methods_allowed: ['card'],
  commission_type: 'percentage',
  commission_value: 500,
}

const fakeInvite = {
  id: 'invite-uuid-1',
  used: false,
  expires_at: EXPIRES_FUTURE,
  plan_id: PLAN_ID,
  plans: fakePlan,
}

const mockKv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
} as unknown as Env

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    invite_token: 'inv_abc123',
    admin_name: 'Alice Owner',
    admin_email: 'alice@example.com',
    password: 'securepass',
    business_name: 'The Burger Place',
    timezone: 'UTC',
    currency: 'USD',
    address: { line1: '123 Main St', city: 'New York', country: 'US' },
    ...overrides,
  }
}

function post(body: unknown) {
  return app.request(
    '/auth/signup',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  )
}

// Build a mock for the Supabase fluent query chain
function mockChain(resolved: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    single: vi.fn().mockResolvedValue(resolved),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  }
  return chain
}

// Set up the full happy-path mockFrom sequence (5 calls):
// 1. invites lookup  2. slug check  3. restaurant insert  4. users insert  5. invite update
function setupHappyPathFrom(inviteOverride?: object) {
  const invite = inviteOverride ? { ...fakeInvite, ...inviteOverride } : fakeInvite
  mockFrom
    .mockImplementationOnce(() => mockChain({ data: invite, error: null }))
    .mockImplementationOnce(() => mockChain({ data: null, error: null }))
    .mockImplementationOnce(() => mockChain({ data: { id: RESTAURANT_ID }, error: null }))
    .mockImplementationOnce(() => mockChain({ data: null, error: null }))
    .mockImplementationOnce(() => mockChain({ data: null, error: null }))
}

beforeEach(() => {
  // vi.resetAllMocks clears impl queues + call history on all mocks
  vi.resetAllMocks()

  mockKv.get.mockResolvedValue(null)
  mockKv.put.mockResolvedValue(undefined)
  mockKv.delete.mockResolvedValue(undefined)

  mockCreateUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  mockDeleteUser.mockResolvedValue({ error: null })
  mockSignIn.mockResolvedValue({
    data: {
      session: { access_token: 'at-token', refresh_token: 'rt-token', expires_in: 3600 },
    },
    error: null,
  })

  setupHappyPathFrom()
})

describe('STORY-012 · Restaurant signup via invite', () => {
  it('valid signup: restaurant + user created, invite marked used, 201 + tokens', async () => {
    const res = await post(validBody())
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('access_token', 'at-token')
    expect(body).toHaveProperty('refresh_token', 'rt-token')
    expect((body.user as Record<string, string>).role).toBe('restaurant_owner')
    expect((body.restaurant as Record<string, string>).slug).toBe('the-burger-place')
    // all 5 mockFrom calls consumed (invite, slug, restaurant, user, mark-used)
    expect(mockFrom).toHaveBeenCalledTimes(5)
  })

  it('tokens returned: signed session credentials present', async () => {
    const res = await post(validBody())
    const body = await res.json() as Record<string, unknown>
    expect(body.access_token).toBe('at-token')
    expect(body.refresh_token).toBe('rt-token')
    expect(body.expires_in).toBe(3600)
  })

  it('auto-generated slug: slugified from business_name', async () => {
    const res = await post(validBody({ business_name: "Bob's Café & Grill!" }))
    expect(res.status).toBe(201)
    const body = await res.json() as Record<string, unknown>
    const slug = (body.restaurant as Record<string, string>).slug
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    expect(slug).not.toContain("'")
    expect(slug).not.toContain('&')
  })

  it('slug collision: suffix appended until unique', async () => {
    // Override: slug check returns a hit first, then free
    mockFrom.mockReset()
    mockFrom
      .mockImplementationOnce(() => mockChain({ data: fakeInvite, error: null }))          // invite lookup
      .mockImplementationOnce(() => mockChain({ data: { id: 'taken' }, error: null }))     // slug taken
      .mockImplementationOnce(() => mockChain({ data: null, error: null }))                // slug free on retry
      .mockImplementationOnce(() => mockChain({ data: { id: RESTAURANT_ID }, error: null })) // restaurant insert
      .mockImplementationOnce(() => mockChain({ data: null, error: null }))                // users insert
      .mockImplementationOnce(() => mockChain({ data: null, error: null }))                // invite update

    const res = await post(validBody())
    expect(res.status).toBe(201)
    const slug = ((await res.json()) as { restaurant: { slug: string } }).restaurant.slug
    expect(slug).toMatch(/^the-burger-place-[a-z0-9]{4}$/)
  })

  it('invalid invite token (not found): 400', async () => {
    mockFrom.mockReset()
    mockFrom.mockImplementationOnce(() => mockChain({ data: null, error: null }))
    const res = await post(validBody())
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_invite')
  })

  it('used invite: 409', async () => {
    mockFrom.mockReset()
    mockFrom.mockImplementationOnce(() =>
      mockChain({ data: { ...fakeInvite, used: true }, error: null }),
    )
    const res = await post(validBody())
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('invite_used')
  })

  it('expired invite: 410', async () => {
    mockFrom.mockReset()
    mockFrom.mockImplementationOnce(() =>
      mockChain({ data: { ...fakeInvite, expires_at: EXPIRES_PAST }, error: null }),
    )
    const res = await post(validBody())
    expect(res.status).toBe(410)
    expect(((await res.json()) as { error: string }).error).toBe('invite_expired')
  })

  it('invalid timezone: 422', async () => {
    // invite fetch still needed; mocked in beforeEach so no reset required
    const res = await post(validBody({ timezone: 'NotARealTimezone' }))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_timezone')
  })

  it('missing required fields: 422 validation error', async () => {
    const res = await post({ invite_token: 'inv_abc', admin_email: 'bad-email' })
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; code: string }
    expect(body.error).toBe('invalid_request')
    expect(body.code).toBe('validation')
  })

  it('KV: slug key and plan key written after successful signup', async () => {
    await post(validBody())
    const putCalls = mockKv.put.mock.calls as [string, string, unknown][]
    const keys = putCalls.map(([k]) => k)
    expect(keys.some((k) => k.startsWith('slug:'))).toBe(true)
    expect(keys.some((k) => k.startsWith('plan:'))).toBe(true)
    // slug:{slug} → restaurant_id (JSON-encoded)
    const slugCall = putCalls.find(([k]) => k.startsWith('slug:'))!
    expect(JSON.parse(slugCall[1])).toBe(RESTAURANT_ID)
  })
})
