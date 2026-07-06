import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

/** Fake SETTINGS_CACHE so the billing:summary cache exercises but never persists across tests. */
function makeKv(): KVNamespace {
  const store = new Map<string, string>()
  return {
    get: async (key: string, type?: 'json') => {
      const raw = store.get(key)
      if (raw === undefined) return null
      return type === 'json' ? JSON.parse(raw) : raw
    },
    put: async (key: string, value: string) => void store.set(key, value),
    delete: async (key: string) => void store.delete(key),
  } as unknown as KVNamespace
}

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: makeKv(),
} as unknown as Env

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)

async function token(role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: randomUUID(),
      role,
      restaurant_id: null,
      permissions: [],
      amr: [{ method: 'totp', timestamp: now }],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

function req(path: string, bearer: string): Promise<Response> {
  return app.request(path, { headers: { Authorization: `Bearer ${bearer}` } }, env)
}

let SUPERADMIN = ''
let starterPlanId = ''
let withOrdersId = ''
let noOrdersId = ''
const COMMISSION = 0.05
const createdRestaurantIds: string[] = []

async function createRestaurant(name: string): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `bill-${randomUUID().slice(0, 8)}`,
      display_name: name,
      business_name: `${name} LLC`,
      timezone: 'Europe/Istanbul',
      plan_id: starterPlanId,
      // commission_rate was removed from restaurants in favour of plan-level
      // commission_value (basis points). Set a per-restaurant override so the
      // assertion value stays predictable: 500 bps = 5% = COMMISSION (0.05).
      override_commission_value: 500,
      override_commission_type: 'percentage',
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdRestaurantIds.push(id)
  return id
}

async function insertOrder(restaurantId: string, total: number, createdAt: string): Promise<void> {
  const { error } = await admin.from('orders').insert({
    restaurant_id: restaurantId,
    tracking_token: `ord_live_${randomUUID().replace(/-/g, '')}`,
    payment_method: 'card',
    payment_status: 'captured',
    customer_name: 'Guest',
    customer_email: 'guest@test.local',
    subtotal: total,
    total,
    created_at: createdAt,
  })
  if (error) throw error
}

beforeAll(async () => {
  SUPERADMIN = await token('superadmin')
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  starterPlanId = plan.data.id as string

  withOrdersId = await createRestaurant('Billing With Orders')
  noOrdersId = await createRestaurant('Billing No Orders')

  const now = new Date()
  // Two recent (within 30d) captured orders: 100 + 50 = 150.
  await insertOrder(withOrdersId, 100, now.toISOString())
  await insertOrder(withOrdersId, 50, new Date(now.getTime() - 5 * 86400000).toISOString())
  // One old order (~200 days ago): counts toward total, not 30d.
  await insertOrder(withOrdersId, 70, new Date(now.getTime() - 200 * 86400000).toISOString())
  // Spread across distinct months to test the 12-month cap.
  // Start from m=2 (day 1 of 2 months ago) so all entries are safely outside
  // the 30-day window regardless of which day of the month we run the test.
  for (let m = 2; m <= 15; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
    await insertOrder(withOrdersId, 10, d.toISOString())
  }
})

afterAll(async () => {
  for (const id of createdRestaurantIds) {
    await admin.from('orders').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id)
  }
})

interface SummaryRow {
  id: string
  total_orders: number
  total_order_value: number
  total_orders_30d: number
  total_order_value_30d: number
  estimated_commission_30d: number
}

describe('STORY-010 · commission & billing dashboard', () => {
  it('GET /superadmin/billing: all restaurants returned with commission calc', async () => {
    const res = await req('/superadmin/billing', SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { summary: SummaryRow[] }
    const ids = body.summary.map((r) => r.id)
    expect(ids).toContain(withOrdersId)
    expect(ids).toContain(noOrdersId)
  })

  it('commission = total_order_value_30d * commission_rate', async () => {
    const res = await req('/superadmin/billing', SUPERADMIN)
    const body = (await res.json()) as { summary: SummaryRow[] }
    const row = body.summary.find((r) => r.id === withOrdersId)!
    // 100 + 50 within 30 days = 150.
    expect(Number(row.total_order_value_30d)).toBe(150)
    expect(Number(row.estimated_commission_30d)).toBeCloseTo(150 * COMMISSION, 5)
  })

  it('restaurant with no orders: zeros, not error', async () => {
    const res = await req('/superadmin/billing', SUPERADMIN)
    const body = (await res.json()) as { summary: SummaryRow[] }
    const row = body.summary.find((r) => r.id === noOrdersId)!
    expect(Number(row.total_orders)).toBe(0)
    expect(Number(row.total_order_value)).toBe(0)
    expect(Number(row.estimated_commission_30d)).toBe(0)
  })

  it('monthly breakdown: last 12 months only', async () => {
    const res = await req(`/superadmin/billing/${withOrdersId}`, SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { months: Array<{ month: string; order_value: number }> }
    // 17 distinct order-months created, but the function caps at 12.
    expect(body.months.length).toBe(12)
  })

  it('non-superadmin: 403', async () => {
    const res = await req('/superadmin/billing', await token('restaurant_owner'))
    expect(res.status).toBe(403)
  })
})
