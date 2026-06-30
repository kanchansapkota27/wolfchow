import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerSuperadminRoutes } from '../../src/routes/superadmin'
import { signJwt } from '../../src/services/tokens'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Fake SETTINGS_CACHE recording deletes so KV invalidation can be asserted. */
function makeKv() {
  const store = new Map<string, string>()
  const deletes: string[] = []
  const ns = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => {
      store.delete(key)
      deletes.push(key)
    },
  }
  return { store, deletes, ns: ns as unknown as KVNamespace }
}

const kv = makeKv()
const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: kv.ns,
} as unknown as Env

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)

async function token(role: string, restaurantId: string | null = null): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'admin-1',
      role,
      restaurant_id: restaurantId,
      permissions: [],
      amr: [{ method: 'totp', timestamp: now }],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

const SUPERADMIN = await token('superadmin')

function req(method: string, path: string, bearer: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, env)
}

const flags = {
  menu_photos: true,
  item_modifiers: true,
  category_scheduling: false,
  email_notifications: true,
  order_tracking_page: true,
  analytics_dashboard: false,
  export_orders_csv: false,
  custom_brand_color: true,
  remove_powered_by: false,
  promotions_enabled: true,
  scheduled_orders_enabled: false,
}

function planBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: `Test Plan ${randomUUID().slice(0, 8)}`,
    device_cap: 5,
    item_cap: 100,
    category_cap: 10,
    modifier_cap: 20,
    smtp_monthly_limit: 500,
    transaction_history_days: 30,
    feature_flags: flags,
    payment_methods_allowed: ['card', 'pickup'],
    ...overrides,
  }
}

const createdPlanIds: string[] = []
const createdRestaurantIds: string[] = []

afterAll(async () => {
  for (const id of createdRestaurantIds) await admin.from('restaurants').delete().eq('id', id)
  for (const id of createdPlanIds) await admin.from('plans').delete().eq('id', id)
})

describe('STORY-006 · plan management', () => {
  it('POST /superadmin/plans: 201, plan in DB', async () => {
    const res = await req('POST', '/superadmin/plans', SUPERADMIN, planBody())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { plan: { id: string; name: string } }
    createdPlanIds.push(body.plan.id)
    const row = await admin.from('plans').select('name, device_cap').eq('id', body.plan.id).single()
    expect(row.data?.device_cap).toBe(5)
  })

  it('GET /superadmin/plans: array with correct shape', async () => {
    const res = await req('GET', '/superadmin/plans', SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> }
    expect(Array.isArray(body.plans)).toBe(true)
    const sample = body.plans[0]
    expect(sample).toHaveProperty('feature_flags')
    expect(sample).toHaveProperty('payment_methods_allowed')
    expect(sample).toHaveProperty('device_cap')
  })

  it('PATCH device_cap: DB updated, KV invalidated for all restaurants on plan', async () => {
    const created = (await (await req('POST', '/superadmin/plans', SUPERADMIN, planBody())).json()) as {
      plan: { id: string }
    }
    const planId = created.plan.id
    createdPlanIds.push(planId)

    // Two restaurants on this plan; pre-seed their plan cache keys.
    const rids: string[] = []
    for (let i = 0; i < 2; i++) {
      const r = await admin
        .from('restaurants')
        .insert({
          slug: `plan-${randomUUID().slice(0, 8)}`,
          display_name: 'Plan Test',
          business_name: 'Plan Test LLC',
          timezone: 'Europe/Istanbul',
          plan_id: planId,
        })
        .select('id')
        .single()
      const rid = r.data?.id as string
      rids.push(rid)
      createdRestaurantIds.push(rid)
      kv.store.set(`plan:${rid}`, JSON.stringify({ device_cap: 5 }))
    }

    const res = await req('PATCH', `/superadmin/plans/${planId}`, SUPERADMIN, { device_cap: 7 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plan: { device_cap: number }; invalidated: number }
    expect(body.plan.device_cap).toBe(7)
    expect(body.invalidated).toBe(2)

    const row = await admin.from('plans').select('device_cap').eq('id', planId).single()
    expect(row.data?.device_cap).toBe(7)
    for (const rid of rids) {
      expect(kv.deletes).toContain(`plan:${rid}`)
      expect(kv.store.has(`plan:${rid}`)).toBe(false)
    }
  })

  it('DELETE plan with restaurants: 409', async () => {
    const created = (await (await req('POST', '/superadmin/plans', SUPERADMIN, planBody())).json()) as {
      plan: { id: string }
    }
    const planId = created.plan.id
    createdPlanIds.push(planId)
    const r = await admin
      .from('restaurants')
      .insert({
        slug: `plan-${randomUUID().slice(0, 8)}`,
        display_name: 'Plan Test',
        business_name: 'Plan Test LLC',
        timezone: 'Europe/Istanbul',
        plan_id: planId,
      })
      .select('id')
      .single()
    createdRestaurantIds.push(r.data?.id as string)

    const res = await req('DELETE', `/superadmin/plans/${planId}`, SUPERADMIN)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string; count: number }
    expect(body.error).toBe('plan_in_use')
    expect(body.count).toBeGreaterThanOrEqual(1)
  })

  it('DELETE plan no restaurants: deleted', async () => {
    const created = (await (await req('POST', '/superadmin/plans', SUPERADMIN, planBody())).json()) as {
      plan: { id: string }
    }
    const planId = created.plan.id
    createdPlanIds.push(planId)

    const res = await req('DELETE', `/superadmin/plans/${planId}`, SUPERADMIN)
    expect(res.status).toBe(204)

    // Soft-deleted: excluded from the list and marked in DB.
    const list = (await (await req('GET', '/superadmin/plans', SUPERADMIN)).json()) as {
      plans: Array<{ id: string }>
    }
    expect(list.plans.find((p) => p.id === planId)).toBeUndefined()
    const row = await admin.from('plans').select('deleted_at').eq('id', planId).single()
    expect(row.data?.deleted_at).not.toBeNull()
  })

  it('GET /superadmin/plans: includes restaurant_count per plan', async () => {
    const created = (await (await req('POST', '/superadmin/plans', SUPERADMIN, planBody())).json()) as {
      plan: { id: string }
    }
    const planId = created.plan.id
    createdPlanIds.push(planId)
    const r = await admin
      .from('restaurants')
      .insert({
        slug: `plan-${randomUUID().slice(0, 8)}`,
        display_name: 'Count Test',
        business_name: 'Count Test LLC',
        timezone: 'Europe/Istanbul',
        plan_id: planId,
      })
      .select('id')
      .single()
    createdRestaurantIds.push(r.data?.id as string)

    const body = (await (await req('GET', '/superadmin/plans', SUPERADMIN)).json()) as {
      plans: Array<{ id: string; restaurant_count: number }>
    }
    const row = body.plans.find((p) => p.id === planId)
    expect(row?.restaurant_count).toBe(1)
  })

  it('non-superadmin: 403', async () => {
    const ownerToken = await token('restaurant_owner', randomUUID())
    const res = await req('GET', '/superadmin/plans', ownerToken)
    expect(res.status).toBe(403)
  })

  it('payment_methods_allowed empty array: 422', async () => {
    const res = await req('POST', '/superadmin/plans', SUPERADMIN, planBody({ payment_methods_allowed: [] }))
    expect(res.status).toBe(422)
    expect(((await res.json()) as { error: string }).error).toBe('validation')
  })
})
