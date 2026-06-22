import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createRestaurantUserSchema } from './schemas'
import { registerRestaurantRoutes } from './restaurants'
import { createAdminClient } from '../../services/supabase'

// ── Minimal env stub ────────────────────────────────────────────────────────
const MOCK_ENV = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  SUPABASE_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  MENU_CACHE: {} as KVNamespace,
  FLAGS_CACHE: {} as KVNamespace,
  SETTINGS_CACHE: {} as KVNamespace,
} as unknown as HonoEnv['Bindings']

// ── Superadmin JWT (pre-verified by middleware) ──────────────────────────────
const SUPERADMIN_JWT = {
  sub: 'sa-user-id',
  role: 'superadmin',
  restaurant_id: null,
  permissions: [],
  device_id: null,
  imp: false,
  imp_by: null,
  amr: [{ method: 'totp', timestamp: Date.now() }],
}

// ── Mock Supabase admin client ───────────────────────────────────────────────
vi.mock('../../services/supabase', () => ({
  createAdminClient: vi.fn(),
}))

const mockCreateAdminClient = createAdminClient as MockedFunction<typeof createAdminClient>

function buildApp(adminClient: ReturnType<typeof createAdminClient>) {
  mockCreateAdminClient.mockReturnValue(adminClient)
  const app = new Hono<HonoEnv>()
  app.use('*', async (c, next) => {
    c.set('jwt', SUPERADMIN_JWT)
    await next()
  })
  registerRestaurantRoutes(app)
  return app
}

function makeRequest(app: ReturnType<typeof buildApp>, restaurantId: string, body: unknown) {
  return app.request(`/superadmin/restaurants/${restaurantId}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // @ts-expect-error Workers env
    env: MOCK_ENV,
  })
}

describe('STORY-057 · superadmin create restaurant owner', () => {
  // ── Schema tests ────────────────────────────────────────────────────────
  describe('createRestaurantUserSchema', () => {
    it('accepts a valid full body', () => {
      const result = createRestaurantUserSchema.safeParse({
        email: 'owner@example.com',
        password: 'SecurePass1',
        name: 'Jane Smith',
        phone: '+1-555-0100',
      })
      expect(result.success).toBe(true)
    })

    it('accepts a body without phone', () => {
      const result = createRestaurantUserSchema.safeParse({
        email: 'owner@example.com',
        password: 'SecurePass1',
        name: 'Jane Smith',
      })
      expect(result.success).toBe(true)
    })

    it('rejects password shorter than 8 characters', () => {
      const result = createRestaurantUserSchema.safeParse({
        email: 'owner@example.com',
        password: 'short',
        name: 'Jane Smith',
      })
      expect(result.success).toBe(false)
    })

    it('rejects missing name', () => {
      const result = createRestaurantUserSchema.safeParse({
        email: 'owner@example.com',
        password: 'SecurePass1',
      })
      expect(result.success).toBe(false)
    })

    it('rejects invalid email', () => {
      const result = createRestaurantUserSchema.safeParse({
        email: 'not-an-email',
        password: 'SecurePass1',
        name: 'Jane Smith',
      })
      expect(result.success).toBe(false)
    })
  })

  // ── Route tests ─────────────────────────────────────────────────────────
  describe('POST /superadmin/restaurants/:id/users', () => {
    const RESTAURANT_ID = '00000000-0000-0000-0000-000000000002'
    const USER_ID = '00000000-0000-0000-0000-000000000099'
    const VALID_BODY = {
      email: 'owner@example.com',
      password: 'SecurePass1',
      name: 'Jane Smith',
      phone: '+1-555-0100',
    }

    function makeAdminClient() {
      const deleteUser = vi.fn().mockResolvedValue({ error: null })
      const createUser = vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      })
      const restaurantChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: RESTAURANT_ID }, error: null }),
      }
      const usersInsertChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: USER_ID,
            email: VALID_BODY.email,
            name: VALID_BODY.name,
            role: 'restaurant_owner',
            restaurant_id: RESTAURANT_ID,
            created_at: '2026-06-22T00:00:00.000Z',
          },
          error: null,
        }),
      }
      const auditChain = { insert: vi.fn().mockResolvedValue({ error: null }) }

      return {
        auth: { admin: { createUser, deleteUser } },
        from: vi.fn((table: string) => {
          if (table === 'restaurants') return restaurantChain
          if (table === 'users') return usersInsertChain
          if (table === 'audit_log') return auditChain
          return {}
        }),
        _deleteUser: deleteUser,
      } as unknown as ReturnType<typeof createAdminClient> & { _deleteUser: typeof deleteUser }
    }

    it('201: valid body + existing restaurant returns correct user shape', async () => {
      const client = makeAdminClient()
      const app = buildApp(client)
      const res = await makeRequest(app, RESTAURANT_ID, VALID_BODY)
      expect(res.status).toBe(201)
      const json = await res.json() as { user: Record<string, unknown> }
      expect(json.user.id).toBe(USER_ID)
      expect(json.user.email).toBe(VALID_BODY.email)
      expect(json.user.name).toBe(VALID_BODY.name)
      expect(json.user.role).toBe('restaurant_owner')
      expect(json.user.restaurant_id).toBe(RESTAURANT_ID)
      expect(json.user.force_password_change).toBe(true)
      expect(json.user.created_at).toBeDefined()
    })

    it('404: restaurant not found', async () => {
      const client = makeAdminClient()
      ;(client.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
        if (table === 'restaurants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        return {}
      })
      const app = buildApp(client)
      const res = await makeRequest(app, 'nonexistent-id', VALID_BODY)
      expect(res.status).toBe(404)
      const json = await res.json() as { error: string }
      expect(json.error).toBe('restaurant_not_found')
    })

    it('409: email already taken', async () => {
      const client = makeAdminClient()
      client.auth.admin.createUser = vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered' },
      })
      const app = buildApp(client)
      const res = await makeRequest(app, RESTAURANT_ID, VALID_BODY)
      expect(res.status).toBe(409)
      const json = await res.json() as { error: string }
      expect(json.error).toBe('email_taken')
    })

    it('422: password too short', async () => {
      const client = makeAdminClient()
      const app = buildApp(client)
      const res = await makeRequest(app, RESTAURANT_ID, { ...VALID_BODY, password: 'short' })
      expect(res.status).toBe(422)
      const json = await res.json() as { error: string }
      expect(json.error).toBe('validation')
    })

    it('422: missing name', async () => {
      const client = makeAdminClient()
      const app = buildApp(client)
      const { name: _n, ...bodyWithoutName } = VALID_BODY
      const res = await makeRequest(app, RESTAURANT_ID, bodyWithoutName)
      expect(res.status).toBe(422)
      const json = await res.json() as { error: string }
      expect(json.error).toBe('validation')
    })

    it('500: users insert failure cleans up orphaned auth user', async () => {
      const deleteUser = vi.fn().mockResolvedValue({ error: null })
      const createUser = vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      })
      const client = {
        auth: { admin: { createUser, deleteUser } },
        from: vi.fn((table: string) => {
          if (table === 'restaurants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: RESTAURANT_ID }, error: null }),
            }
          }
          if (table === 'users') {
            return {
              insert: vi.fn().mockReturnThis(),
              select: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
            }
          }
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }),
      } as unknown as ReturnType<typeof createAdminClient>

      const app = buildApp(client)
      const res = await makeRequest(app, RESTAURANT_ID, VALID_BODY)
      expect(res.status).toBe(500)
      const json = await res.json() as { error: string }
      expect(json.error).toBe('create_failed')
      expect(deleteUser).toHaveBeenCalledWith(USER_ID)
    })
  })
})
