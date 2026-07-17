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

async function signIn(admin: ReturnType<typeof createSupabaseAdmin>, email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error(`sign-in failed for ${email}`)
  return data.session.access_token
}

async function postJson<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`)
  return (await res.json()) as T
}

async function ensurePlan(superadminToken: string): Promise<string> {
  const body = await postJson<{ plan: { id: string } }>('/superadmin/plans', superadminToken, {
    name: 'E2E Test Plan',
    device_cap: 5,
    item_cap: 100,
    category_cap: 20,
    modifier_cap: 20,
    smtp_monthly_limit: 1000,
    transaction_history_days: 90,
    feature_flags: {
      menu_photos: true,
      item_modifiers: true,
      category_scheduling: true,
      email_notifications: true,
      order_tracking_page: true,
      analytics_dashboard: true,
      export_orders_csv: true,
      custom_brand_color: true,
      remove_powered_by: true,
      webhook_export: true,
      promotions_enabled: true,
      scheduled_orders_enabled: true,
    },
    payment_methods_allowed: ['card', 'pickup', 'delivery'],
    commission_type: 'percentage',
    commission_value: 500, // basis points = 5.00%
    is_public: false,
  })
  return body.plan.id
}

const ADMIN_SIGNUP_URL = process.env.E2E_ADMIN_SIGNUP_URL || 'http://localhost:5174/signup'

/**
 * The backend returns `invite_url` built from its own SIGNUP_BASE_URL env var,
 * which defaults to the production admin origin unless a developer has
 * manually set SIGNUP_BASE_URL="http://localhost:5174/signup" in their
 * .dev.vars — not something this suite should require. Build the local admin
 * signup URL ourselves from the token instead of trusting the response body.
 */
async function createInvite(superadminToken: string, planId: string): Promise<{ token: string; url: string }> {
  const body = await postJson<{ token: string }>('/superadmin/invites', superadminToken, {
    plan_id: planId,
    restaurant_name: 'E2E Spare Restaurant',
  })
  return { token: body.token, url: `${ADMIN_SIGNUP_URL}?invite=${body.token}` }
}

/**
 * Creates the "main" restaurant + owner account through the real superadmin
 * APIs (POST /superadmin/restaurants, POST /superadmin/restaurants/:id/users)
 * rather than raw DB inserts — exercises real validation/business logic and
 * avoids having to hand-guess the restaurants/users table schema.
 */
async function createMainRestaurant(
  superadminToken: string,
  planId: string,
): Promise<{ restaurantId: string; slug: string }> {
  const slug = `e2e-main-${Date.now()}`
  const restaurantBody = await postJson<{ restaurant: { id: string; slug: string } }>(
    '/superadmin/restaurants',
    superadminToken,
    {
      business_name: 'E2E Main Restaurant',
      display_name: 'E2E Main Restaurant',
      slug,
      timezone: 'America/New_York',
      currency: 'USD',
      country: 'US',
      plan_id: planId,
    },
  )
  const restaurantId = restaurantBody.restaurant.id

  await postJson(`/superadmin/restaurants/${restaurantId}/users`, superadminToken, {
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    name: 'E2E Owner',
  })

  return { restaurantId, slug }
}

/**
 * Seeds one always-available category + item through the real admin menu API
 * (as the restaurant owner, not superadmin), so widget-facing scenarios
 * (E2E-02/03/04/06) don't depend on Task 5 (menu management) having run
 * first — each scenario file must be independently runnable.
 */
async function seedMenuItem(ownerToken: string): Promise<string> {
  const category = await postJson<{ id: string }>('/admin/menu/categories', ownerToken, {
    name: 'E2E Seeded Category',
  })
  const item = await postJson<{ id: string; name: string }>('/admin/menu/items', ownerToken, {
    name: 'E2E Seeded Item',
    // Verified empirically against the running public menu API: price is
    // stored/interpreted as integer CENTS despite the DB column being
    // numeric(10,2) — passing 10.0 here produced a public-facing $0.10 item,
    // not $10.00. 1000 = $10.00.
    price: 1000,
    category_id: category.id,
  })
  return item.name
}

export default async function globalSetup(): Promise<void> {
  const admin = createSupabaseAdmin()

  await ensureSuperadmin(admin)
  const superadminToken = await signIn(admin, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)
  const planId = await ensurePlan(superadminToken)
  const { restaurantId, slug } = await createMainRestaurant(superadminToken, planId)
  const spareInvite = await createInvite(superadminToken, planId)

  const ownerToken = await signIn(admin, OWNER_EMAIL, OWNER_PASSWORD)
  const seededItemName = await seedMenuItem(ownerToken)

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
