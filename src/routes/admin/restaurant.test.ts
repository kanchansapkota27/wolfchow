import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerAdminRoutes } from './index'
import { signJwt } from '../../services/tokens'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockUpdateUser = vi.fn()
const mockSetSession = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({
    auth: {
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  }),
}))

// ── App setup ─────────────────────────────────────────────────────────────────

const fakeUploadUrl = vi.fn(async (_env: unknown, key: string, _exp: number) =>
  `https://fake-r2.example.com/${key}?presigned=1`,
)

const app = new Hono<HonoEnv>()
registerAdminRoutes(app, { generateUploadUrl: fakeUploadUrl })

// ── Fake env ──────────────────────────────────────────────────────────────────

const mockKv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long-xx',
  SETTINGS_CACHE: mockKv,
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_NAME: 'media',
  MEDIA_BUCKET: {},
} as unknown as Env

// ── JWT helper ────────────────────────────────────────────────────────────────

const RESTAURANT_ID = 'rest-uuid-1'
const USER_ID = 'user-uuid-1'
const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'

async function ownerToken(restaurantId = RESTAURANT_ID) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: USER_ID,
      role: 'restaurant_owner',
      restaurant_id: restaurantId,
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

// ── Supabase chain builder ────────────────────────────────────────────────────

function chain(resolved: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  }
}

const fakeRestaurant = {
  id: RESTAURANT_ID,
  slug: 'the-burger-place',
  business_name: 'The Burger Place',
  display_name: 'The Burger Place',
  timezone: 'America/New_York',
  currency: 'USD',
  address: { line1: '123 Main St', city: 'New York', country: 'US' },
  active: true,
  plan_id: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockKv.delete.mockResolvedValue(undefined)
  mockSetSession.mockResolvedValue({})
  mockUpdateUser.mockResolvedValue({ error: null })
})

describe('STORY-013 · Restaurant profile management', () => {
  it('GET /admin/restaurant: returns own restaurant only', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: fakeRestaurant, error: null }))

    const token = await ownerToken()
    const res = await app.request('/admin/restaurant', { headers: authHeaders(token) }, env)

    expect(res.status).toBe(200)
    const body = await res.json() as { restaurant: typeof fakeRestaurant }
    expect(body.restaurant.id).toBe(RESTAURANT_ID)
    expect(body.restaurant.business_name).toBe('The Burger Place')
    // Confirm the query filtered by restaurant_id from JWT (not any other)
    const eqCall = mockFrom.mock.results[0]?.value.eq.mock.calls[0]
    expect(eqCall).toEqual(['id', RESTAURANT_ID])
  })

  it('PATCH display_name: updated, settings and theme KV invalidated', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { ...fakeRestaurant, display_name: 'Burger Palace' }, error: null }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ display_name: 'Burger Palace' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { restaurant: { display_name: string } }
    expect(body.restaurant.display_name).toBe('Burger Palace')

    // KV invalidation: both settings: and theme: deleted
    const deletedKeys = mockKv.delete.mock.calls.map(([k]: string[]) => k)
    expect(deletedKeys).toContain(`settings:${RESTAURANT_ID}`)
    expect(deletedKeys).toContain(`theme:${RESTAURANT_ID}`)
  })

  it('PATCH menu_image_display: updated to a valid scope', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { ...fakeRestaurant, menu_image_display: 'mobile' }, error: null }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ menu_image_display: 'mobile' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { restaurant: { menu_image_display: string } }
    expect(body.restaurant.menu_image_display).toBe('mobile')
  })

  it('PATCH menu_image_display: rejects an invalid scope value', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ menu_image_display: 'everywhere' }),
      },
      env,
    )

    expect(res.status).toBe(422)
  })

  it('PATCH timezone: field stripped, not forwarded to DB', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { ...fakeRestaurant, display_name: 'Updated' }, error: null }),
    )

    const token = await ownerToken()
    await app.request(
      '/admin/restaurant',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ display_name: 'Updated', timezone: 'Europe/London' }),
      },
      env,
    )

    // 'timezone' must NOT appear in the .update() call
    const updateChain = mockFrom.mock.results[0]?.value
    const updateArgs = updateChain.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).not.toHaveProperty('timezone')
    expect(updateArgs).toHaveProperty('display_name', 'Updated')
  })

  it('PATCH slug: field stripped, not forwarded to DB', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { ...fakeRestaurant, display_name: 'New Name' }, error: null }),
    )

    const token = await ownerToken()
    await app.request(
      '/admin/restaurant',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ display_name: 'New Name', slug: 'hacked-slug' }),
      },
      env,
    )

    const updateArgs = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).not.toHaveProperty('slug')
  })

  it('POST /admin/restaurant/logo: presigned R2 URL returned with correct path', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant/logo',
      { method: 'POST', headers: authHeaders(token) },
      env,
    )

    expect(res.status).toBe(201)
    const body = await res.json() as { upload_url: string; r2_key: string }
    // Path format: {restaurant_id}/logo/{randomId}.webp
    expect(body.r2_key).toMatch(new RegExp(`^${RESTAURANT_ID}/logo/[a-z0-9]{21}\\.webp$`))
    expect(body.upload_url).toContain(body.r2_key)
  })

  it('PATCH /admin/restaurant with logo_r2_key: persisted after a valid own-restaurant key', async () => {
    const key = `${RESTAURANT_ID}/logo/abc123.webp`
    mockFrom.mockReturnValueOnce(
      chain({ data: { ...fakeRestaurant, logo_r2_key: key }, error: null }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ logo_r2_key: key }) },
      env,
    )

    expect(res.status).toBe(200)
    const updateArgs = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).toHaveProperty('logo_r2_key', key)
  })

  it('PATCH /admin/restaurant with logo_r2_key: rejects a key scoped to a different restaurant (IDOR)', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ logo_r2_key: 'someone-elses-restaurant/logo/abc123.webp' }) },
      env,
    )

    expect(res.status).toBe(422)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PATCH /admin/restaurant with logo_r2_key: rejects a well-scoped but malformed suffix', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant',
      { method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ logo_r2_key: `${RESTAURANT_ID}/../../secrets.env` }) },
      env,
    )

    expect(res.status).toBe(422)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('PATCH /admin/restaurant/profile: name updated, email rejected', async () => {
    const token = await ownerToken()

    // email should be rejected
    const res = await app.request(
      '/admin/restaurant/profile',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ email: 'newemail@example.com' }),
      },
      env,
    )
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toBe('email_immutable')
  })

  it('PATCH /admin/restaurant/profile: name update succeeds', async () => {
    mockFrom.mockReturnValueOnce(
      chain({
        data: { id: USER_ID, name: 'New Name', phone: null, email: 'alice@example.com', role: 'restaurant_owner' },
        error: null,
      }),
    )

    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant/profile',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ name: 'New Name' }),
      },
      env,
    )

    expect(res.status).toBe(200)
    const body = await res.json() as { name: string }
    expect(body.name).toBe('New Name')
    // email must not appear in the users update
    const updateArgs = mockFrom.mock.results[0]?.value.update.mock.calls[0]?.[0] as Record<string, unknown>
    expect(updateArgs).not.toHaveProperty('email')
  })

  it('PATCH /admin/restaurant/password: delegates to supabase auth.updateUser', async () => {
    const token = await ownerToken()
    const res = await app.request(
      '/admin/restaurant/password',
      {
        method: 'PATCH',
        headers: authHeaders(token),
        body: JSON.stringify({ password: 'newSecurePass!' }),
      },
      env,
    )

    expect(res.status).toBe(204)
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newSecurePass!' })
  })
})
