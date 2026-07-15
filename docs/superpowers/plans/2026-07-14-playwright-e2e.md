# STORY-080: Playwright E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Playwright E2E suite in a new `e2e/` directory covering 9 of STORY-080's 10 critical-path scenarios (E2E-07 explicitly documented as not-yet-buildable), running against locally-started dev servers (backend Worker + all 5 frontend apps) and local Supabase.

**Architecture:** `e2e/` is a standalone workspace (own `package.json`, not part of the `web/` pnpm workspace) since it drives both the backend Worker and all 5 frontend apps. A Playwright `globalSetup` provisions a superadmin user, a plan, and a ready-to-use **main test restaurant + owner admin account** directly via the Supabase admin client and backend API (bypassing UI, since most scenarios need a ready fixture, not a repeat test of signup) — plus one **spare, unused invite token** reserved for E2E-01 to consume through the real signup UI. Each scenario file is independent (no cross-file execution-order dependency): it logs in via a shared `loginAs` fixture against the one shared main restaurant, or (E2E-01 only) via the spare invite.

**Tech Stack:** `@playwright/test`, TypeScript, `@supabase/supabase-js` (for globalSetup), the existing local dev stack (`wrangler dev`, 5× `vite dev`, local Supabase).

## Global Constraints

- Local Supabase (`supabase start`) must already be running — Playwright does not manage it. Document this precondition in `e2e/README.md`; do not attempt to automate it.
- No application code changes in this story — `e2e/` only.
- Ports (confirmed from each app's `vite.config.ts`): superadmin 5173, admin 5174, tablet 5175, widget 5176, tracking 5177. Backend: 8789 (`wrangler.toml` `[dev]`).
- `MFA_DEV_BYPASS="true"` must be set in the repo's `.dev.vars` for superadmin login to work without TOTP in these tests (per `.dev.vars.example`) — document as a precondition, do not set it programmatically (never touch `.dev.vars`).
- Selectors: prefer `getByRole`/`getByLabel`/`getByText` with the exact strings verified against current source (see each task). Where a task notes "verify interactively," the exact source-derived string is the starting point but the implementer should confirm against the actually-running app before finalizing, since E2E selector authoring (unlike production code edits) is expected to be interactively verified — this is normal Playwright practice, not a plan gap.
- One commit per task, `STORY-080: <description>`, `Refs: #78`.
- Every implemented scenario is self-contained and independently runnable (`npx playwright test e2e-05-pause-resume.spec.ts` must pass on its own, not only as part of a full run) — this is why `loginAs` re-authenticates per test file rather than relying on a shared `storageState` chain.

---

### Task 1: `e2e/` workspace scaffold

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/tsconfig.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/README.md`
- Create: `e2e/.gitignore`

**Interfaces:**
- Produces: `e2e/playwright.config.ts`'s `projects` array (names: `admin-desktop`, `superadmin-desktop`, `tablet-ipad`, `widget-mobile`, `tracking-mobile`) — later tasks' spec files declare which project(s) they run under via `test.describe.configure` or rely on the config's per-directory `testMatch`, whichever is simpler once Task 4+ exist. For this task, just wire the 5 projects generically; scenario-to-project mapping is finalized in each scenario's own task since some scenarios span multiple apps/projects (e.g. E2E-03 touches widget, tablet, AND tracking).

- [ ] **Step 1: Create `e2e/package.json`**

```json
{
  "name": "@wolfchow/e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "test:ui": "playwright test --ui"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@supabase/supabase-js": "^2.108.1",
    "@types/node": "^22.10.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create `e2e/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 3: Create `e2e/.gitignore`**

```
node_modules/
.tmp/
test-results/
playwright-report/
playwright/.cache/
```

- [ ] **Step 4: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

const BACKEND_URL = 'http://localhost:8789'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared main restaurant fixture — avoid cross-test races on its data
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --dir .. dev', // wrangler dev, from repo root
      url: BACKEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-superadmin dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-admin dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-tablet dev',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-widget dev',
      url: 'http://localhost:5176',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-tracking dev',
      url: 'http://localhost:5177',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'admin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' } },
    { name: 'superadmin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' } },
    { name: 'tablet-ipad', use: { ...devices['iPad Pro 12.9'], baseURL: 'http://localhost:5175' } },
    { name: 'widget-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5176' } },
    { name: 'tracking-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5177' } },
  ],
})
```

Note: scenarios spanning multiple apps (E2E-03, E2E-04, E2E-10) use `page.context().newPage()` / multiple `BrowserContext`s within one test rather than Playwright's cross-project test dependencies, so they can run under a single project (pick the most relevant one — e.g. `widget-mobile` for E2E-03/04 since the widget is the primary actor) and open the other apps' URLs directly (full URLs, not relative, since `baseURL` only applies to the project's primary app).

- [ ] **Step 5: Create `e2e/README.md`**

```markdown
# STORY-080 Playwright E2E

## Prerequisites (not automated by this suite)

1. Local Supabase running: `supabase start` (from repo root)
2. `.dev.vars` has `MFA_DEV_BYPASS="true"` (see `.dev.vars.example`) — required for superadmin login without TOTP
3. `.dev.vars` has valid `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MASTER_ENCRYPTION_KEY`

## Running

```bash
cd e2e
pnpm install
pnpm test              # headless, all projects
pnpm test:headed       # visible browser
pnpm test:ui           # Playwright UI mode
npx playwright test e2e-05-pause-resume.spec.ts   # single scenario
```

Playwright auto-starts the backend Worker and all 5 frontend dev servers via `webServer` (reuses already-running ones). It does NOT start Supabase — start that yourself first.

## What's covered

9 of STORY-080's 10 scenarios. **E2E-07 (realtime out-of-stock sync) is a documented `test.fixme()`** — the widget has no realtime subscription code yet; see `tests/e2e-07-realtime-availability.spec.ts` for the tracking issue.

## Seeding

`global-setup.ts` provisions: a superadmin login, one plan, one ready-to-use "main" test restaurant + owner admin account (used by most scenarios), and one spare unused invite token (consumed only by E2E-01, which tests the actual signup-via-invite UI). `global-teardown.ts` deletes everything it created. Seed data written to `e2e/.tmp/seed.json` (gitignored) for fixtures to read.
```

- [ ] **Step 6: Install and verify config loads**

Run: `cd e2e && pnpm install && npx playwright install chromium webkit && npx playwright test --list`
Expected: Playwright CLI reports 0 tests found (no spec files yet) without config errors — confirms `playwright.config.ts` is syntactically valid and the 5 projects register. `global-setup.ts`/`global-teardown.ts` don't exist yet, so this step's `--list` run will fail if the config eagerly requires them — if so, temporarily comment out `globalSetup`/`globalTeardown` for this verification step only, then restore them (they're implemented in Task 2, next).

- [ ] **Step 7: Commit**

```bash
git add e2e/package.json e2e/tsconfig.json e2e/playwright.config.ts e2e/README.md e2e/.gitignore
git commit -m "$(cat <<'EOF'
STORY-080: scaffold e2e/ Playwright workspace

New standalone workspace (not part of the web/ pnpm workspace, since
it drives both the backend Worker and all 5 frontend apps). 5
projects per-app, webServer auto-starts all 6 dev servers with
reuseExistingServer.

Refs: #78
EOF
)"
```

---

### Task 2: `global-setup.ts` / `global-teardown.ts` — seed fixture data

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`
- Create: `e2e/lib/supabase-admin.ts`

**Interfaces:**
- Produces: `e2e/.tmp/seed.json` with shape:
  ```ts
  interface SeedData {
    superadmin: { email: string; password: string }
    plan: { id: string }
    mainRestaurant: {
      restaurantId: string
      slug: string
      ownerEmail: string
      ownerPassword: string
      seededItemName: string // one always-available menu item, for scenarios that need to add something to cart
    }
    spareInvite: { token: string; url: string } // E2E-01 only
  }
  ```
  `slug` and `seededItemName` exist so every scenario touching the widget (E2E-02, 03, 04, 06) has a guaranteed-present menu item and the widget's required embed identifier, without depending on another task (e.g. Task 5) having run first — each scenario file must be independently runnable per Global Constraints.
- Consumes (from `e2e/lib/supabase-admin.ts`): `createSupabaseAdmin(): SupabaseClient` — reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` the same way `scripts/seed-superadmin.ts` does (env var first, local-default fallback), so this file mirrors that script's `LOCAL` constant rather than importing it (the script lives in `scripts/`, outside `e2e/`'s package boundary — duplication here is intentional and small, not worth a shared package for 6 lines).

- [ ] **Step 1: Create `e2e/lib/supabase-admin.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export function createSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || LOCAL_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_SERVICE_ROLE_KEY
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:8789'
```

- [ ] **Step 2: Create `e2e/global-setup.ts`**

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { createSupabaseAdmin, BACKEND_URL } from './lib/supabase-admin'

const SUPERADMIN_EMAIL = 'e2e-superadmin@wolfchow.test'
const SUPERADMIN_PASSWORD = 'E2e-superadmin-pass-1!'
const OWNER_EMAIL = 'e2e-owner@wolfchow.test'
const OWNER_PASSWORD = 'E2e-owner-pass-1!'

async function ensureSuperadmin(admin: ReturnType<typeof createSupabaseAdmin>): Promise<void> {
  let userId: string | null = null
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  userId = list?.users.find((u) => u.email?.toLowerCase() === SUPERADMIN_EMAIL)?.id ?? null

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD,
      email_confirm: true,
    })
    if (error || !data.user) throw error ?? new Error('createUser failed for superadmin')
    userId = data.user.id
  }

  const { error } = await admin.from('users').upsert(
    { id: userId, email: SUPERADMIN_EMAIL, name: 'e2e-superadmin', role: 'superadmin', restaurant_id: null, permissions: [], active: true },
    { onConflict: 'id' },
  )
  if (error) throw error
}

async function superadminAccessToken(admin: ReturnType<typeof createSupabaseAdmin>): Promise<string> {
  const { data, error } = await admin.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD })
  if (error || !data.session) throw error ?? new Error('superadmin sign-in failed')
  return data.session.access_token
}

async function ensurePlan(token: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/superadmin/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'E2E Test Plan',
      device_cap: 5,
      item_cap: 100,
      category_cap: 20,
      modifier_cap: 20,
      smtp_monthly_limit: 1000,
      transaction_history_days: 90,
      feature_flags: { widget_enabled: true, promotions_enabled: true },
      payment_methods_allowed: ['card', 'pickup', 'delivery'],
      commission_type: 'percentage',
      commission_value: 5,
      is_public: false,
    }),
  })
  if (!res.ok) throw new Error(`plan creation failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { plan: { id: string } }
  return body.plan.id
}

async function createInvite(token: string, planId: string): Promise<{ token: string; url: string }> {
  const res = await fetch(`${BACKEND_URL}/superadmin/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ plan_id: planId, restaurant_name: 'E2E Spare Restaurant' }),
  })
  if (!res.ok) throw new Error(`invite creation failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { token: string; invite_url: string }
  return { token: body.token, url: body.invite_url }
}

/**
 * Creates the "main" restaurant + owner account directly (Supabase admin API +
 * DB insert), bypassing the signup UI — most scenarios need a ready fixture to
 * log into, not a repeat test of signup (that's E2E-01's job, via a separate
 * spare invite consumed through the real UI).
 */
async function createMainRestaurant(admin: ReturnType<typeof createSupabaseAdmin>, planId: string): Promise<{ restaurantId: string; slug: string; seededItemName: string }> {
  const slug = `e2e-main-${Date.now()}`
  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .insert({
      name: 'E2E Main Restaurant',
      slug,
      plan_id: planId,
      active: true,
      currency: 'USD',
      timezone: 'America/New_York',
      country: 'US',
    })
    .select('id')
    .single()
  if (restaurantError || !restaurant) throw restaurantError ?? new Error('restaurant insert failed')
  const restaurantId = restaurant.id as string

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  })
  if (authError || !authUser.user) throw authError ?? new Error('owner createUser failed')

  const { error: userRowError } = await admin.from('users').insert({
    id: authUser.user.id,
    email: OWNER_EMAIL,
    name: 'E2E Owner',
    role: 'restaurant_owner',
    restaurant_id: restaurantId,
    permissions: [],
    active: true,
  })
  if (userRowError) throw userRowError

  // One always-available category + item, so widget-facing scenarios
  // (E2E-02/03/04/06) don't depend on Task 5 (menu management) having run
  // first — each scenario file must be independently runnable.
  const { data: category, error: categoryError } = await admin
    .from('menu_categories')
    .insert({ restaurant_id: restaurantId, name: 'E2E Seeded Category', active: true, sort_order: 0 })
    .select('id')
    .single()
  if (categoryError || !category) throw categoryError ?? new Error('seed category insert failed')

  const seededItemName = 'E2E Seeded Item'
  const { error: itemError } = await admin.from('menu_items').insert({
    restaurant_id: restaurantId,
    category_id: category.id,
    name: seededItemName,
    price: 1000, // cents — verify column name/units against supabase/migrations/20260615000100_schema.sql
    active: true,
    availability_state: 'available',
  })
  if (itemError) throw itemError

  return { restaurantId, slug, seededItemName }
}

export default async function globalSetup(): Promise<void> {
  const admin = createSupabaseAdmin()

  await ensureSuperadmin(admin)
  const token = await superadminAccessToken(admin)
  const planId = await ensurePlan(token)
  const { restaurantId, slug, seededItemName } = await createMainRestaurant(admin, planId)
  const spareInvite = await createInvite(token, planId)

  await mkdir('.tmp', { recursive: true })
  await writeFile(
    '.tmp/seed.json',
    JSON.stringify(
      {
        superadmin: { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD },
        plan: { id: planId },
        mainRestaurant: { restaurantId, slug, ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD, seededItemName },
        spareInvite,
      },
      null,
      2,
    ),
  )
}
```

**Note for implementer:** the exact `restaurants`/`menu_categories`/`menu_items` table columns (`slug`, `currency`, `timezone`, `country`, `price` units, `availability_state`, etc.) and `plans` table columns used above were inferred from `PLAN_COLUMNS` in `src/routes/superadmin/plans.ts`, STORY-082's admin `Menu.tsx` research (which confirmed `price` is stored in cents), and general schema conventions seen elsewhere in this plan's research — **verify against `supabase/migrations/20260615000100_schema.sql`** (the base schema migration) before running, and adjust any column name/requiredness mismatches. This is exactly the kind of interactive verification called out in Global Constraints. Note the path is now `.tmp/seed.json` (relative to `e2e/`, matching Playwright's cwd), not `e2e/.tmp/seed.json`.

- [ ] **Step 3: Create `e2e/global-teardown.ts`**

```ts
import { readFile, rm } from 'node:fs/promises'
import { createSupabaseAdmin } from './lib/supabase-admin'

interface SeedData {
  mainRestaurant: { restaurantId: string; ownerEmail: string }
  superadmin: { email: string }
}

export default async function globalTeardown(): Promise<void> {
  const admin = createSupabaseAdmin()

  let seed: SeedData | null = null
  try {
    seed = JSON.parse(await readFile('.tmp/seed.json', 'utf-8')) as SeedData
  } catch {
    return // global-setup never completed; nothing to clean up
  }

  // Delete the restaurant (cascades to menu/orders/etc. per FK constraints —
  // verify ON DELETE CASCADE is set in the schema migration; if not, this step
  // needs explicit child-table deletes first).
  await admin.from('restaurants').delete().eq('id', seed.mainRestaurant.restaurantId)

  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  const ownerAuthUser = authUsers?.users.find((u) => u.email === seed!.mainRestaurant.ownerEmail)
  if (ownerAuthUser) await admin.auth.admin.deleteUser(ownerAuthUser.id)

  // menu_categories/menu_items seeded in global-setup are expected to cascade-
  // delete via the restaurant FK (ON DELETE CASCADE) — verify this against the
  // schema migration; if not cascading, add explicit deletes here before the
  // restaurant delete above.

  // Superadmin user is left in place (idempotent re-seed pattern, matches
  // scripts/seed-superadmin.ts — cheap to leave, avoids re-creating TOTP state
  // across runs since MFA_DEV_BYPASS skips that anyway in this environment).

  await rm('.tmp/seed.json', { force: true })
}
```

- [ ] **Step 4: Verify seeding works end-to-end**

Precondition: `supabase start` running, `.dev.vars` has `MFA_DEV_BYPASS="true"`, backend running (`pnpm dev` from repo root in a separate terminal, or let Playwright's `webServer` start it in the next step).

Run: `cd e2e && npx playwright test --list` (this now executes `globalSetup` since project has no spec files yet to actually run, but `--list` still triggers `globalSetup`/`globalTeardown` per Playwright's lifecycle — if it does NOT trigger them with zero tests, instead run `npx playwright test --grep nonexistent` which forces the full lifecycle without matching any real test).
Expected: `e2e/.tmp/seed.json` is created with populated `superadmin`, `plan`, `mainRestaurant`, `spareInvite` fields; no errors in stdout. Manually inspect the file's contents.

- [ ] **Step 5: Commit**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts e2e/lib/supabase-admin.ts
git commit -m "$(cat <<'EOF'
STORY-080: add global setup/teardown seeding for E2E fixtures

Provisions a superadmin login, one plan, a ready-to-use main test
restaurant + owner account (created directly via Supabase admin API,
bypassing UI), and a spare unused invite token reserved for E2E-01's
signup-UI test. Writes e2e/.tmp/seed.json for test fixtures to read;
teardown deletes what it created.

Refs: #78
EOF
)"
```

---

### Task 3: Shared fixtures — `loginAs`, `stripeCardFrame`, seed reader

**Files:**
- Create: `e2e/fixtures/seed.ts`
- Create: `e2e/fixtures/auth.ts`
- Create: `e2e/fixtures/stripe.ts`

**Interfaces:**
- Produces: `readSeed(): Promise<SeedData>` (from `fixtures/seed.ts`); `loginAsStaff(page: Page, email: string, password: string): Promise<void>` and `loginTabletDevice(page: Page, deviceToken: string): Promise<void>` (from `fixtures/auth.ts`); `fillStripeTestCard(page: Page): Promise<void>` (from `fixtures/stripe.ts`).
- Consumes: Playwright's `Page` type; the `SeedData` shape from Task 2.

- [ ] **Step 1: Create `e2e/fixtures/seed.ts`**

```ts
import { readFile } from 'node:fs/promises'

export interface SeedData {
  superadmin: { email: string; password: string }
  plan: { id: string }
  mainRestaurant: { restaurantId: string; slug: string; ownerEmail: string; ownerPassword: string; seededItemName: string }
  spareInvite: { token: string; url: string }
}

export async function readSeed(): Promise<SeedData> {
  const raw = await readFile('.tmp/seed.json', 'utf-8')
  return JSON.parse(raw) as SeedData
}
```

Path is `.tmp/seed.json`, relative to `e2e/` (Playwright's cwd when running tests, matching Task 2's `global-setup.ts`/`global-teardown.ts` which both use the same relative path — verify this cwd assumption interactively on first run; if Playwright's actual cwd differs, adjust all three files consistently).

- [ ] **Step 2: Create `e2e/fixtures/auth.ts`**

```ts
import type { Page } from '@playwright/test'

/** Logs into any app using the shared LoginPage's staff-login form (admin, superadmin). */
export async function loginAsStaff(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Logs into the tablet app via a device token. */
export async function loginTabletDevice(page: Page, deviceToken: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('DEVICE TOKEN').fill(deviceToken)
  await page.getByRole('button', { name: 'CONNECT DEVICE' }).click()
}
```

- [ ] **Step 3: Create `e2e/fixtures/stripe.ts`**

```ts
import type { Page } from '@playwright/test'

/**
 * Fills Stripe's test card into the widget checkout's Card Details section.
 * The widget mounts Stripe Elements into a dynamically-created light-DOM div
 * appended to document.body (outside the widget's shadow root) — there is no
 * stable container selector, so this locates Stripe's own iframe directly.
 * VERIFY the iframe name/title interactively against a running widget/Checkout
 * flow before relying on this in a real test — Stripe's iframe naming can vary
 * by Stripe.js version.
 */
export async function fillStripeTestCard(page: Page): Promise<void> {
  const stripeFrame = page.frameLocator('iframe[title="Secure card payment input frame"]')
  await stripeFrame.locator('[name="cardnumber"]').fill('4242424242424242')
  await stripeFrame.locator('[name="exp-date"]').fill('12/34')
  await stripeFrame.locator('[name="cvc"]').fill('123')
  await stripeFrame.locator('[name="postal"]').fill('10001')
}
```

- [ ] **Step 4: Run typecheck**

Run: `cd e2e && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add e2e/fixtures/seed.ts e2e/fixtures/auth.ts e2e/fixtures/stripe.ts
git commit -m "$(cat <<'EOF'
STORY-080: add shared E2E fixtures (seed reader, login, Stripe card fill)

Refs: #78
EOF
)"
```

---

### Task 4: E2E-01 — Signup via invite

**Files:**
- Create: `e2e/tests/e2e-01-signup-invite.spec.ts`

**Interfaces:**
- Consumes: `readSeed()` (Task 3) for `spareInvite.url`.

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'

test.describe('E2E-01 · signup via invite', () => {
  test.use({ baseURL: 'http://localhost:5174' }) // admin app, regardless of project

  test('3-step form → arrives at admin dashboard', async ({ page }) => {
    const seed = await readSeed()
    await page.goto(seed.spareInvite.url) // e.g. http://localhost:5174/signup?invite=inv_...

    // Step 1 — Your account
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    await page.getByLabel('Full name').fill('E2E Test Owner')
    await page.getByLabel('Email').fill(`e2e-signup-${Date.now()}@wolfchow.test`)
    await page.getByLabel('Password', { exact: true }).fill('E2e-signup-pass-1!')
    await page.getByLabel('Confirm password').fill('E2e-signup-pass-1!')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2 — Your restaurant
    await expect(page.getByRole('heading', { name: 'Your restaurant' })).toBeVisible()
    await page.getByLabel('Business name').fill(`E2E Signup Restaurant ${Date.now()}`)
    await page.getByLabel('City').fill('New York')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 — Profile (optional)
    await expect(page.getByRole('heading', { name: 'Profile (optional)' })).toBeVisible()
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL('http://localhost:5174/')
  })
})
```

**Note for implementer:** Step 2's field list (`Address line 1`, `Country` select, `Currency` select, `Timezone`) may include required fields not filled above — verify interactively which fields actually block `"Next"` and fill only those, following the research in this plan's Task 4 findings (#2 in the original UI research). Adjust the test to fill whatever the running form actually requires.

- [ ] **Step 2: Run it against the live stack**

Precondition: `supabase start`, backend + admin app running (via `pnpm dev` in repo root and `pnpm --filter @wolfchow/app-admin dev` in `web/`, or let Playwright's `webServer` handle it).

Run: `cd e2e && npx playwright test e2e-01-signup-invite.spec.ts --project=admin-desktop --headed`
Expected: PASS, ends on the admin dashboard (`/`). If it fails on a specific field, use `--debug` to step through and correct the test against the actual rendered form.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-01-signup-invite.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-01 signup-via-invite test

Refs: #78
EOF
)"
```

---

### Task 5: E2E-02 — Menu management

**Files:**
- Create: `e2e/tests/e2e-02-menu-management.spec.ts`

**Interfaces:**
- Consumes: `readSeed()`, `loginAsStaff()`.

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-02 · admin creates menu item, appears in widget', () => {
  test('category + item + modifier → visible in widget', async ({ browser }) => {
    const seed = await readSeed()
    const itemName = `E2E Item ${Date.now()}`
    const categoryName = `E2E Category ${Date.now()}`

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/menu')

    // Add category
    await adminPage.getByRole('button', { name: 'Add category' }).click()
    await adminPage.getByLabel('Name').fill(categoryName)
    await adminPage.getByRole('button', { name: 'Create' }).click()
    await expect(adminPage.getByText(categoryName)).toBeVisible()

    // Add item
    await adminPage.getByRole('button', { name: 'Add Item' }).click()
    await adminPage.getByLabel('Name').fill(itemName)
    await adminPage.getByLabel('Price').fill('12.50')
    await adminPage.getByRole('button', { name: 'Create Item' }).click()
    await expect(adminPage.getByText(itemName)).toBeVisible()

    await adminContext.close()

    // Verify in widget. web/apps/widget/src/main.tsx's bootstrap() reads the
    // restaurant identifier from the host element's `data-restaurant` attribute
    // (a slug, not a UUID) — seed.mainRestaurant.slug (Task 2) supplies it.
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?restaurant=${seed.mainRestaurant.slug}`)
    await expect(widgetPage.getByText(itemName)).toBeVisible({ timeout: 10_000 })
    await widgetContext.close()
  })
})
```

**Note for implementer:** verify `demo.html` (`web/apps/widget/demo.html`) actually accepts a `?restaurant=<slug>` query param and threads it into the mounted host element's `data-restaurant` attribute (rather than only supporting a hardcoded/build-time slug) — read that file before finalizing this test; if it doesn't support a runtime override, add a minimal one (small, in-scope change to the demo harness, not application code).

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-02-menu-management.spec.ts --project=admin-desktop --headed`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-02-menu-management.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-02 menu management test

Refs: #78
EOF
)"
```

---

### Task 6: E2E-03 — Card order flow (widget → tablet → tracking)

**Files:**
- Create: `e2e/tests/e2e-03-card-order-flow.spec.ts`

**Interfaces:**
- Consumes: `readSeed()`, `loginAsStaff()`, `loginTabletDevice()`, `fillStripeTestCard()`.
- Note: requires the main restaurant to have a Stripe test-mode key configured (via the admin Payments page's restricted-key flow, `StripeKeyGuide`/`StripeBlock` in `apps/admin/src/pages/Payments.tsx` — see STORY-082's context) and at least one menu item (reuse Task 5's item, or create a fresh one in this test's own setup) — and a tablet device token (create one via the admin Devices page, per the research's #12 findings, `"+ Add Device"` → `"Register Device"` → copy token).

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'
import { fillStripeTestCard } from '../fixtures/stripe'

test.describe('E2E-03 · card order: widget → tablet accepts → tracking progresses', () => {
  test('full flow', async ({ browser }) => {
    const seed = await readSeed()

    // --- Admin: provision a tablet device token ---
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await adminPage.getByLabel('Device name').fill(`E2E Tablet ${Date.now()}`)
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    const deviceToken = await adminPage.locator('p.font-mono').first().textContent() // VERIFY: no stable selector for the raw token per research — adjust locator
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()

    if (!deviceToken) throw new Error('failed to capture device token from admin UI')

    // --- Tablet: log in with the device token ---
    const tabletContext = await browser.newContext({ baseURL: 'http://localhost:5175' })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())
    await expect(tabletPage).toHaveURL('http://localhost:5175/')

    // --- Widget: place a card order ---
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?restaurant=${seed.mainRestaurant.slug}`)
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Customer')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-customer@wolfchow.test')
    await widgetPage.getByLabel('💳 Pay by Card').check()
    await fillStripeTestCard(widgetPage)
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()

    // Capture the tracking URL from the Success screen (verify the exact
    // element — research didn't cover Success.tsx's tracking-link markup;
    // read web/apps/widget/src/components/Success.tsx before finalizing).
    const trackingLink = await widgetPage.getByRole('link', { name: /track/i }).getAttribute('href')
    await widgetContext.close()

    // --- Tablet: accept the order ---
    await expect(tabletPage.getByRole('button', { name: 'ACCEPT' })).toBeVisible({ timeout: 15_000 })
    await tabletPage.getByRole('button', { name: 'ACCEPT' }).click()

    // --- Tracking page: confirm status progresses ---
    if (!trackingLink) throw new Error('failed to capture tracking link from widget Success screen')
    const trackingContext = await browser.newContext({ baseURL: 'http://localhost:5177' })
    const trackingPage = await trackingContext.newPage()
    await trackingPage.goto(trackingLink)
    await expect(trackingPage.getByText('Accepted')).toBeVisible({ timeout: 15_000 })

    // --- Tablet: advance through preparing → ready ---
    await tabletPage.getByRole('button', { name: 'START PREPARING' }).click()
    await expect(trackingPage.getByText('Being prepared')).toBeVisible({ timeout: 15_000 })
    await tabletPage.getByRole('button', { name: 'READY FOR PICKUP' }).click()
    await expect(trackingPage.getByText('Ready for pickup!')).toBeVisible({ timeout: 15_000 })

    await tabletContext.close()
    await trackingContext.close()
  })
})
```

**Note for implementer:** this is the most involved scenario in the suite (5 contexts, real Stripe test-mode capture, cross-app polling). Before running, confirm: (a) the main restaurant has a Stripe test-mode publishable+secret key saved (add this as a setup step in this test or, better, add it to `global-setup.ts`'s `createMainRestaurant` via a direct vault-write if an internal API exists for it — check `src/routes/internal/*` for a vault-seeding endpoint before hand-rolling one through the UI in every test run), (b) the widget has at least one menu item available (reuses Task 5's, but Task 5 and this test must not assume execution order — either have this test create its own item, or make menu-item creation part of `global-setup.ts` too). Flag both gaps back to the plan if they change the fixture design meaningfully — this is exactly the kind of cross-task coordination issue worth raising rather than guessing silently.

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-03-card-order-flow.spec.ts --project=widget-mobile --headed --timeout=60000`
Expected: PASS. This test is the most likely to need interactive debugging (`--debug`) given the number of unverified selectors flagged above.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-03-card-order-flow.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-03 card order flow test (widget → tablet → tracking)

Refs: #78
EOF
)"
```

---

### Task 7: E2E-04 — Pickup order flow (no Stripe)

**Files:**
- Create: `e2e/tests/e2e-04-pickup-order-flow.spec.ts`

**Interfaces:**
- Consumes: same fixtures as Task 6, minus `fillStripeTestCard`.

- [ ] **Step 1: Write the test**

Reuse Task 6's structure exactly, but select the pickup payment method instead of card, and skip the Stripe fill step:

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'

test.describe('E2E-04 · pickup order: no Stripe, straight to accepted → completed', () => {
  test('full flow', async ({ browser }) => {
    const seed = await readSeed()

    // --- Admin: provision a tablet device token (same as E2E-03 Step 1) ---
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await adminPage.getByLabel('Device name').fill(`E2E Tablet Pickup ${Date.now()}`)
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    const deviceToken = await adminPage.locator('p.font-mono').first().textContent()
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()
    if (!deviceToken) throw new Error('failed to capture device token')

    const tabletContext = await browser.newContext({ baseURL: 'http://localhost:5175' })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?restaurant=${seed.mainRestaurant.slug}`)
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Pickup Customer')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-pickup@wolfchow.test')
    await widgetPage.getByLabel('🥡 Pay on Pickup').check()
    // No Stripe fields render for pickup — go straight to submit.
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()
    await widgetContext.close()

    // --- Tablet: order should already be in the queue without needing a
    // Stripe webhook/confirm round-trip — accept straight through to completed.
    await expect(tabletPage.getByRole('button', { name: 'ACCEPT' })).toBeVisible({ timeout: 15_000 })
    await tabletPage.getByRole('button', { name: 'ACCEPT' }).click()
    await tabletPage.getByRole('button', { name: 'START PREPARING' }).click()
    await tabletPage.getByRole('button', { name: 'READY FOR PICKUP' }).click()
    await expect(tabletPage.getByRole('button', { name: 'COMPLETE ORDER' })).toBeVisible()
    await tabletPage.getByRole('button', { name: 'COMPLETE ORDER' }).click()

    await tabletContext.close()
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-04-pickup-order-flow.spec.ts --project=widget-mobile --headed --timeout=60000`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-04-pickup-order-flow.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-04 pickup order flow test

Refs: #78
EOF
)"
```

---

### Task 8: E2E-05 — Pause/resume ordering

**Files:**
- Create: `e2e/tests/e2e-05-pause-resume.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-05 · admin pauses → widget shows banner → unpause re-enables checkout', () => {
  test('full flow', async ({ browser }) => {
    const seed = await readSeed()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/orders')
    await expect(adminPage.getByText('Orders are Flowing')).toBeVisible()
    await adminPage.getByRole('button', { name: 'Pause System' }).click()
    await adminPage.getByRole('button', { name: 'Manual' }).click()
    await expect(adminPage.getByText('Orders paused')).toBeVisible()

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?restaurant=${seed.mainRestaurant.slug}`)
    await expect(widgetPage.getByText('Orders are currently paused')).toBeVisible({ timeout: 10_000 })

    await adminPage.getByRole('button', { name: 'Resume' }).click()
    await expect(adminPage.getByText('Orders are Flowing')).toBeVisible()

    await widgetPage.reload()
    await expect(widgetPage.getByText('Orders are currently paused')).not.toBeVisible()

    await adminContext.close()
    await widgetContext.close()
  })
})
```

**Note for implementer:** verify whether `"Manual"` is a distinct button from `"Rest of day"` in the actual pause-duration picker, and whether selecting it immediately pauses or requires a further confirm step — the research only captured the button labels, not the full interaction sequence. Also verify whether the widget needs a manual `reload()` to pick up the unpause (no realtime in widget, confirmed during spec-writing) or whether it polls settings periodically — check `web/apps/widget/src/App.tsx`'s settings-fetch logic.

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-05-pause-resume.spec.ts --project=admin-desktop --headed`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-05-pause-resume.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-05 pause/resume test

Refs: #78
EOF
)"
```

---

### Task 9: E2E-06 — Promo code

**Files:**
- Create: `e2e/tests/e2e-06-promo-code.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-06 · admin creates promo → customer applies at checkout', () => {
  test('discount applied correctly', async ({ browser }) => {
    const seed = await readSeed()
    const promoCode = `E2E${Date.now()}`.slice(0, 20).toUpperCase()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/promotions')
    await adminPage.getByRole('button', { name: 'Create promotion' }).click()
    await adminPage.getByLabel('Title').fill('E2E 10% off')
    await adminPage.getByLabel('% Off').check()
    await adminPage.getByLabel('Discount value (%)').fill('10')
    await adminPage.getByLabel('Promo code', { exact: true }).fill(promoCode)
    await adminPage.getByRole('button', { name: 'Create' }).click()
    await expect(adminPage.getByText(promoCode)).toBeVisible()
    await adminContext.close()

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?restaurant=${seed.mainRestaurant.slug}`)
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Enter code').fill(promoCode)
    await widgetPage.getByRole('button', { name: 'Apply' }).click()
    await expect(widgetPage.getByText(/off$/)).toBeVisible({ timeout: 10_000 })

    await widgetContext.close()
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-06-promo-code.spec.ts --project=admin-desktop --headed`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-06-promo-code.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-06 promo code test

Refs: #78
EOF
)"
```

---

### Task 10: E2E-07 — documented `test.fixme()` (not implemented)

**Files:**
- Create: `e2e/tests/e2e-07-realtime-availability.spec.ts`

- [ ] **Step 1: Write the fixme placeholder**

```ts
import { test } from '@playwright/test'

test.describe('E2E-07 · kitchen marks item out of stock → widget shows Unavailable within 3s', () => {
  test.fixme(
    true,
    'Not implemented: the widget (web/apps/widget/src) has no realtime subscription ' +
    'code at all (confirmed via grep for "realtime|channel|subscribe" — zero matches). ' +
    'This scenario depends on STORY-076–078 (Slice 4 widget real-time public sync), ' +
    'which are not yet merged to main. Revisit once those land — the tablet-side ' +
    'availability toggle (Inventory.tsx) already works; only the widget push side is missing.',
  )

  test('kitchen marks unavailable → widget reflects it live', async () => {
    // Intentionally empty — test.fixme() above prevents this from running.
  })
})
```

- [ ] **Step 2: Verify it's reported as fixme, not a failure**

Run: `cd e2e && npx playwright test e2e-07-realtime-availability.spec.ts`
Expected: Playwright's reporter shows 1 fixme, 0 failed.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-07-realtime-availability.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: document E2E-07 as not-yet-implemented (test.fixme)

Widget has no realtime subscription code; this scenario depends on
unmerged STORY-076-078. Documented rather than faked or silently
skipped.

Refs: #78
EOF
)"
```

---

### Task 11: E2E-08 — Refund

**Files:**
- Create: `e2e/tests/e2e-08-refund.spec.ts`

**Interfaces:**
- Requires a completed card order to refund — this test creates its own via the same flow as Task 6, then refunds it. If Task 6's flow proves flaky/slow when duplicated, consider extracting a shared `placeCardOrder(...)` helper into `e2e/fixtures/` at implementation time (a reasonable, small refactor within this task's scope — not a plan violation, since both tasks independently need "place and accept a card order").

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-08 · admin issues refund → Stripe test mode confirms', () => {
  test('refund from transactions page', async ({ browser }) => {
    const seed = await readSeed()

    // Precondition: at least one completed card transaction exists for this
    // restaurant. If Task 6 (E2E-03) already ran in this suite invocation, its
    // order may be reusable — but per Global Constraints, this test must be
    // independently runnable, so place a fresh order here rather than depend
    // on E2E-03 having run first. Reuse E2E-03/04's order-placement steps
    // (extract to a shared fixture if duplicating 3+ times starts to hurt).

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/transactions')

    const firstRow = adminPage.getByRole('button', { name: /^Transaction/ }).first()
    await firstRow.click()
    await adminPage.getByRole('button', { name: 'Issue refund' }).click()
    await adminPage.getByRole('button', { name: 'Confirm refund' }).click()
    await expect(adminPage.getByText('This order has been refunded')).toBeVisible({ timeout: 15_000 })

    await adminContext.close()
  })
})
```

**Note for implementer:** flesh out the "place a fresh order" precondition using Task 6's pattern (device + widget checkout with Stripe test card) before the admin steps above — the skeleton here only covers the refund UI itself, per the research findings for `Transactions.tsx`/`RefundModal`.

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-08-refund.spec.ts --project=admin-desktop --headed --timeout=60000`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-08-refund.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-08 refund test

Refs: #78
EOF
)"
```

---

### Task 12: E2E-09 — Superadmin suspends restaurant

**Files:**
- Create: `e2e/tests/e2e-09-suspend-restaurant.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-09 · superadmin suspends restaurant → admin login shows suspended', () => {
  test('full flow, then reactivate to leave fixtures clean', async ({ browser }) => {
    const seed = await readSeed()

    const superadminContext = await browser.newContext({ baseURL: 'http://localhost:5173' })
    const superadminPage = await superadminContext.newPage()
    await loginAsStaff(superadminPage, seed.superadmin.email, seed.superadmin.password)
    await superadminPage.goto('/restaurants')
    await superadminPage.getByText('E2E Main Restaurant').click()
    await superadminPage.getByRole('button', { name: 'Suspend' }).click()
    await superadminPage.getByRole('dialog', { name: 'Suspend restaurant' }).getByRole('button', { name: 'Suspend' }).click()
    await expect(superadminPage.getByText('Suspended')).toBeVisible()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await expect(adminPage.getByRole('heading', { name: 'Account suspended' })).toBeVisible({ timeout: 10_000 })
    await adminContext.close()

    // Reactivate so later test runs / other scenarios aren't broken by this
    // restaurant staying suspended.
    await superadminPage.getByRole('button', { name: 'Reactivate' }).click()
    await superadminPage.getByRole('dialog', { name: 'Reactivate restaurant' }).getByRole('button', { name: 'Reactivate' }).click()
    await expect(superadminPage.getByText('Active')).toBeVisible()

    await superadminContext.close()
  })
})
```

**Note for implementer:** since this test mutates the shared main restaurant's active/suspended state, and `playwright.config.ts` sets `fullyParallel: false, workers: 1`, ordering matters less across files — but this test's own reactivate-at-the-end step is load-bearing for suite hygiene. If it fails between suspend and reactivate (e.g. an assertion throws), a later run would start from a suspended restaurant. Consider wrapping the reactivate call in a `test.afterEach` hook instead of inline at the end, so it runs even if an earlier assertion in the test fails — this is a reasonable improvement to make during implementation.

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-09-suspend-restaurant.spec.ts --project=superadmin-desktop --headed`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-09-suspend-restaurant.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-09 suspend/reactivate restaurant test

Refs: #78
EOF
)"
```

---

### Task 13: E2E-10 — Device token tablet permissions

**Files:**
- Create: `e2e/tests/e2e-10-tablet-permissions.spec.ts`

**Interfaces:**
- Per the UI research (#12): there is no separate "staff invite" flow for kitchen-role tablet access in this codebase — access is provisioned entirely via device tokens (Devices page) with per-permission checkboxes. This test verifies a device WITHOUT the `orders:accept_reject` permission cannot accept an order (permission enforcement), matching STORY-080's original intent ("permissions verified") even though the literal "staff invited" framing doesn't map onto a real flow in this codebase.

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'

test.describe('E2E-10 · device permissions gate tablet actions', () => {
  test('device without accept/reject permission cannot accept orders', async ({ browser }) => {
    const seed = await readSeed()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await adminPage.getByLabel('Device name').fill(`E2E Limited Tablet ${Date.now()}`)
    // Uncheck the default-checked accept/reject permission, per research finding
    // #12: default-checked are orders:accept_reject and orders:status.
    await adminPage.getByLabel('Accept / Reject').uncheck()
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    const deviceToken = await adminPage.locator('p.font-mono').first().textContent()
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()
    if (!deviceToken) throw new Error('failed to capture device token')

    const tabletContext = await browser.newContext({ baseURL: 'http://localhost:5175' })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())
    await expect(tabletPage).toHaveURL('http://localhost:5175/')

    // No order to accept yet, so directly verify the permission gate rather
    // than the full order flow (E2E-03/04 already cover full acceptance) —
    // check whether the UI hides the Accept/Decline actions entirely, or
    // whether the OrderQueue page itself isn't reachable/shows a permission
    // notice. VERIFY the exact behavior interactively — the research did not
    // cover what a permission-less device sees on this page, only what a
    // fully-permissioned one sees.

    await tabletContext.close()
  })
})
```

**Note for implementer:** this task's final assertion is intentionally left open — the UI research didn't cover what a tablet session without `orders:accept_reject` actually renders (a hidden button? a disabled one? a redirect?). Read `web/apps/tablet/src/App.tsx`'s route guards and `OrderQueue.tsx`'s permission checks before finalizing the assertion; this is a case where the plan genuinely can't specify the exact expected UI without that read, and it's a small, contained investigation appropriate to do during implementation rather than blocking the whole plan on it.

- [ ] **Step 2: Run it**

Run: `cd e2e && npx playwright test e2e-10-tablet-permissions.spec.ts --project=admin-desktop --headed`
Expected: PASS once the final assertion is filled in per the note above.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/e2e-10-tablet-permissions.spec.ts
git commit -m "$(cat <<'EOF'
STORY-080: add E2E-10 device permission enforcement test

Reframed from the story's original "staff invited" wording to match
this codebase's actual model: tablet/kitchen access is provisioned
entirely via device tokens with per-permission checkboxes, not a
separate staff-invite flow.

Refs: #78
EOF
)"
```

---

## Final verification

- [ ] Run: `cd e2e && npx playwright test` (full suite, all projects, `workers: 1`)
  Expected: 9 scenarios pass (or are fixed up per each task's "Note for implementer" during implementation), 1 (`e2e-07`) reports fixme, 0 unexpected failures.
- [ ] Run: `npx tsc --noEmit` (from `e2e/`)
  Expected: no type errors.
- [ ] Confirm `e2e/.gitignore` actually excludes `.tmp/`, `test-results/`, `playwright-report/` from the commit (`git status` after a full local run should show no generated artifacts staged).
- [ ] Update the Docmost story page (page ID `019f6359-a967-747f-bc0e-719dca702390`) — check off all 13 tasks, note any scenario whose implementation diverged from this plan's draft code (expected for at least Tasks 4, 6, 10, 13 per their explicit "Note for implementer" callouts), move Status to 🔵 In Review once the PR is open.
- [ ] Push branch, open PR titled `STORY-080: Playwright E2E (critical paths) — 9 of 10 scenarios`, move Vikunja #78 to In Review with the PR URL, per CLAUDE.md.
