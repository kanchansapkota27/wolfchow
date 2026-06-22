# STORY-057: Superadmin Create Restaurant Owner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /superadmin/restaurants/:id/users` — provisions a Supabase Auth account + `public.users` row (`role: restaurant_owner`) for an existing restaurant.

**Architecture:** Single new route added to the existing `registerRestaurantRoutes` function in `restaurants.ts`. A new Zod schema is added to `schemas.ts`. Tests go in a new `restaurants.test.ts` file co-located with the implementation. No DB migration required — `force_password_change` lives in GoTrue user metadata.

**Tech Stack:** Hono (Cloudflare Workers), Supabase Admin Client, Zod, Vitest + `@cloudflare/vitest-pool-workers`

## Global Constraints

- No `any` — use `unknown` and narrow, or define proper types
- All Supabase calls use the service-role admin client (`createAdminClient`)
- No `console.log` in production code
- Test file must have a `describe` block named `'STORY-057 · superadmin create restaurant owner'`
- Commit format: `STORY-057: {imperative description}` + `Refs: #59`

---

### Task 1: Add Zod schema

**Files:**
- Modify: `src/routes/superadmin/schemas.ts`
- Test: `src/routes/superadmin/restaurants.test.ts` (new file, schema tests only)

**Interfaces:**
- Produces: `createRestaurantUserSchema` (Zod schema), `CreateRestaurantUserInput` (inferred type)

- [ ] **Step 1: Write the failing tests for schema validation**

Create `src/routes/superadmin/restaurants.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createRestaurantUserSchema } from './schemas'

describe('STORY-057 · superadmin create restaurant owner', () => {
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
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd wolfchow
npx vitest run src/routes/superadmin/restaurants.test.ts
```

Expected: FAIL — `createRestaurantUserSchema` is not exported from `schemas.ts`

- [ ] **Step 3: Add the schema to `schemas.ts`**

In `src/routes/superadmin/schemas.ts`, append after the existing exports:

```typescript
/** Create a restaurant owner account directly (superadmin-provisioned). */
export const createRestaurantUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
})

export type CreateRestaurantUserInput = z.infer<typeof createRestaurantUserSchema>
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/routes/superadmin/restaurants.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/superadmin/schemas.ts src/routes/superadmin/restaurants.test.ts
git commit -m "STORY-057: add createRestaurantUserSchema and schema tests

Refs: #59"
```

---

### Task 2: Implement the route handler

**Files:**
- Modify: `src/routes/superadmin/restaurants.ts`
- Test: `src/routes/superadmin/restaurants.test.ts`

**Interfaces:**
- Consumes: `createRestaurantUserSchema` from `./schemas`, `createAdminClient` from `../../services/supabase`, `Context<HonoEnv>` from hono/types
- Produces: `POST /superadmin/restaurants/:id/users` → 201 `{ user }` | 404 | 409 | 422 | 500

- [ ] **Step 1: Write the failing route tests**

Add these tests inside the existing `describe('STORY-057 · superadmin create restaurant owner')` block in `restaurants.test.ts`.

First, add imports at the top of the file (replace existing import block):

```typescript
import { describe, it, expect, vi, type MockedFunction } from 'vitest'
import { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createRestaurantUserSchema } from './schemas'
import { registerRestaurantRoutes } from './restaurants'

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

import { createAdminClient } from '../../services/supabase'
const mockCreateAdminClient = createAdminClient as MockedFunction<typeof createAdminClient>

// Helper: build an app that skips JWT/MFA middleware (already verified in unit tests)
function buildApp(adminClient: ReturnType<typeof createAdminClient>) {
  mockCreateAdminClient.mockReturnValue(adminClient as ReturnType<typeof createAdminClient>)
  const app = new Hono<HonoEnv>()
  // Inject JWT claims directly — bypasses the middleware stack
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
```

Now add the route tests inside the describe block, after the schema tests:

```typescript
  describe('POST /superadmin/restaurants/:id/users', () => {
    const RESTAURANT_ID = '00000000-0000-0000-0000-000000000002'
    const USER_ID = '00000000-0000-0000-0000-000000000099'
    const VALID_BODY = {
      email: 'owner@example.com',
      password: 'SecurePass1',
      name: 'Jane Smith',
      phone: '+1-555-0100',
    }

    function makeAdminClient(overrides: Record<string, unknown> = {}) {
      const deleteUser = vi.fn().mockResolvedValue({ error: null })
      const createUser = vi.fn().mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
      })
      const fromRestaurants = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: RESTAURANT_ID }, error: null }),
      }
      const fromUsers = {
        insert: vi.fn().mockResolvedValue({ error: null }),
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
      const fromAudit = { insert: vi.fn().mockResolvedValue({ error: null }) }

      return {
        auth: { admin: { createUser, deleteUser } },
        from: vi.fn((table: string) => {
          if (table === 'restaurants') return fromRestaurants
          if (table === 'users') return fromUsers
          if (table === 'audit_log') return fromAudit
          return {}
        }),
        _mocks: { createUser, deleteUser, fromRestaurants, fromUsers, fromAudit },
        ...overrides,
      } as unknown as ReturnType<typeof createAdminClient>
    }

    it('201: valid body + existing restaurant returns user shape', async () => {
      const client = makeAdminClient()
      const app = buildApp(client)
      const res = await makeRequest(app, RESTAURANT_ID, VALID_BODY)
      expect(res.status).toBe(201)
      const json = await res.json() as { user: Record<string, unknown> }
      expect(json.user.id).toBe(USER_ID)
      expect(json.user.email).toBe(VALID_BODY.email)
      expect(json.user.role).toBe('restaurant_owner')
      expect(json.user.restaurant_id).toBe(RESTAURANT_ID)
      expect(json.user.force_password_change).toBe(true)
    })

    it('404: restaurant not found', async () => {
      const client = makeAdminClient()
      // @ts-expect-error mock override
      client.from = vi.fn((table: string) => {
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
      // @ts-expect-error mock override
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
    })

    it('500: users insert failure cleans up auth user', async () => {
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
            return { insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }) }
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
```

- [ ] **Step 2: Run tests to confirm new route tests fail**

```bash
npx vitest run src/routes/superadmin/restaurants.test.ts
```

Expected: schema tests PASS (5), route tests FAIL (handler doesn't exist yet)

- [ ] **Step 3: Add the route to `restaurants.ts`**

In `src/routes/superadmin/restaurants.ts`, add this import at the top alongside the existing schema import:

```typescript
import { createRestaurantDirectSchema, updateRestaurantSchema, createRestaurantUserSchema } from './schemas'
```

Then add this route inside `registerRestaurantRoutes`, after the existing `app.post('/superadmin/restaurants', ...)` handler:

```typescript
  app.post('/superadmin/restaurants/:id/users', async (c) => {
    const id = c.req.param('id')
    const caller = c.get('jwt')

    const parsed = createRestaurantUserSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Confirm restaurant exists
    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    // Create Supabase Auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { force_password_change: true },
    })
    if (authError || !authData.user) {
      if (authError?.message?.includes('already')) {
        return c.json({ error: 'email_taken' }, 409)
      }
      return c.json({ error: 'create_failed' }, 500)
    }

    const userId = authData.user.id

    // Insert public.users row
    const { data: userRow, error: userError } = await admin
      .from('users')
      .insert({
        id: userId,
        restaurant_id: id,
        role: 'restaurant_owner',
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email,
      })
      .select('id, email, name, role, restaurant_id, created_at')
      .single()

    if (userError || !userRow) {
      void admin.auth.admin.deleteUser(userId)
      return c.json({ error: 'create_failed' }, 500)
    }

    // Fire-and-forget audit entry
    void admin.from('audit_log').insert({
      restaurant_id: id,
      table_name: 'users',
      operation: 'CREATE_OWNER',
      user_id: caller.sub,
      new_data: { email: parsed.data.email, name: parsed.data.name, role: 'restaurant_owner' },
    })

    const row = userRow as {
      id: string
      email: string
      name: string
      role: string
      restaurant_id: string
      created_at: string
    }

    return c.json(
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name,
          role: row.role,
          restaurant_id: row.restaurant_id,
          force_password_change: true,
          created_at: row.created_at,
        },
      },
      201,
    )
  })
```

- [ ] **Step 4: Run all tests to confirm they pass**

```bash
npx vitest run src/routes/superadmin/restaurants.test.ts
```

Expected: all tests PASS (schema: 5, route: 6)

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
npx vitest run
```

Expected: all existing tests still PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/superadmin/restaurants.ts src/routes/superadmin/restaurants.test.ts
git commit -m "STORY-057: implement POST /superadmin/restaurants/:id/users

Provisions a Supabase Auth account + public.users row (restaurant_owner)
for an existing restaurant. Includes orphan cleanup on insert failure and
a fire-and-forget audit log entry.

Refs: #59"
```

---

### Task 3: Push, open PR, update tracking

**Files:** none (git + GitHub + Vikunja + Docmost)

- [ ] **Step 1: Push branch**

```bash
git push origin feature/STORY-057-superadmin-create-owner
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "STORY-057: superadmin create restaurant owner" \
  --body "$(cat <<'EOF'
## Summary

Adds \`POST /superadmin/restaurants/:id/users\` so superadmin can provision an owner account for a restaurant that was created via direct creation (no invite flow).

- Creates Supabase Auth user with \`email_confirm: true\` and \`user_metadata.force_password_change = true\`
- Inserts \`public.users\` row with \`role: restaurant_owner\`
- Orphan cleanup: if the DB insert fails, the auth user is deleted
- Fire-and-forget audit log entry (\`CREATE_OWNER\`)
- Multiple owners per restaurant allowed

## Acceptance criteria

- [x] 201 with user shape on success
- [x] 404 when restaurant not found
- [x] 409 when email already registered
- [x] 422 on invalid body (password < 8, missing name, bad email)
- [x] 500 with auth user cleanup when users insert fails
- [x] Audit log entry written
- [x] All 7 tests passing

## Links

- Docmost: https://wolfchow.docmost.com/s/restrocfv2/p/story-057-superadmin-create-restaurant-owner-019eed4e9810
- Vikunja: #59

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Move Vikunja task to In Review**

Use Vikunja MCP:
```
vikunja_tasks.comment({ id: 59, comment: "PR: <pr_url>" })
```
(paste the actual PR URL from step 2 output)

- [ ] **Step 4: Update Docmost story page**

Update the page (ID: `019eed4e-9810-7796-a29a-26168f4e1382`) — change Status to `🔵 In Review`, add the PR link under Links.
