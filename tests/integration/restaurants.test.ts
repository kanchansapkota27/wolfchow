import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerSuperadminRoutes } from '../../src/routes/superadmin'
import { jwtMiddleware } from '../../src/middleware/jwt'
import { requireActiveRestaurant } from '../../src/middleware/activeRestaurant'
import type { Broadcaster, EventType } from '../../src/services/realtime'
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

/** One fake KV shared by all three cache namespaces; records deletes. */
function makeKv() {
  const deletes: string[] = []
  const ns = {
    get: async () => null,
    put: async () => {},
    delete: async (key: string) => void deletes.push(key),
  }
  return { deletes, ns: ns as unknown as KVNamespace }
}
const kv = makeKv()

/** Fake broadcaster recording calls synchronously. */
const broadcasts: Array<{ restaurantId: string; event: EventType }> = []
const fakeBroadcaster: Broadcaster = {
  broadcast: (restaurantId, event) => void broadcasts.push({ restaurantId, event }),
}

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  MENU_CACHE: kv.ns,
  FLAGS_CACHE: kv.ns,
  SETTINGS_CACHE: kv.ns,
} as unknown as Env

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app, { broadcaster: () => fakeBroadcaster })
// Representative tenant route to prove requireActiveRestaurant (Slice-2 /admin/*).
app.get('/admin/whatever', jwtMiddleware, requireActiveRestaurant(), (c) => c.json({ ok: true }))

async function token(role: string, restaurantId: string | null = null): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: randomUUID(),
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

function req(method: string, path: string, bearer: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, env)
}

let SUPERADMIN = ''
let starterPlanId = ''
let growthPlanId = ''
const createdRestaurantIds: string[] = []
const namePrefix = `RM-${randomUUID().slice(0, 6)}`

async function createRestaurant(name: string, active = true): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `rm-${randomUUID().slice(0, 8)}`,
      display_name: name,
      business_name: `${name} LLC`,
      timezone: 'Europe/Istanbul',
      plan_id: starterPlanId,
      active,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdRestaurantIds.push(id)
  return id
}

beforeAll(async () => {
  SUPERADMIN = await token('superadmin')
  const starter = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (starter.error) throw starter.error
  starterPlanId = starter.data.id as string
  const growth = await admin.from('plans').select('id').eq('name', 'Growth').single()
  if (growth.error) throw growth.error
  growthPlanId = growth.data.id as string

  await createRestaurant(`${namePrefix} Alpha`)
  await createRestaurant(`${namePrefix} Bravo`)
})

afterAll(async () => {
  for (const id of createdRestaurantIds) {
    await admin.from('audit_log').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id)
  }
})

describe('STORY-008 · restaurant management', () => {
  it('GET list: paginated, correct shape', async () => {
    const res = await req('GET', '/superadmin/restaurants?page=1', SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      restaurants: Array<Record<string, unknown>>
      page: number
      page_size: number
      total: number
    }
    expect(body.page).toBe(1)
    expect(body.page_size).toBe(20)
    expect(body.restaurants.length).toBeGreaterThan(0)
    const sample = body.restaurants[0]!
    for (const key of ['id', 'slug', 'display_name', 'plan_name', 'active', 'order_count_30d']) {
      expect(sample).toHaveProperty(key)
    }
  })

  it('search by name: filters correctly', async () => {
    const res = await req('GET', `/superadmin/restaurants?search=${encodeURIComponent(`${namePrefix} Alpha`)}`, SUPERADMIN)
    const body = (await res.json()) as { restaurants: Array<{ display_name: string }> }
    expect(body.restaurants.length).toBe(1)
    expect(body.restaurants[0]?.display_name).toBe(`${namePrefix} Alpha`)
  })

  it('PATCH plan_id: DB updated, KV plan key invalidated', async () => {
    const id = await createRestaurant(`${namePrefix} Patch`)
    const res = await req('PATCH', `/superadmin/restaurants/${id}`, SUPERADMIN, { plan_id: growthPlanId })
    expect(res.status).toBe(200)
    const row = await admin.from('restaurants').select('plan_id').eq('id', id).single()
    expect(row.data?.plan_id).toBe(growthPlanId)
    expect(kv.deletes).toContain(`plan:${id}`)
  })

  it('suspend: active=false, KV cleared, Realtime broadcast', async () => {
    const id = await createRestaurant(`${namePrefix} Suspend`)
    broadcasts.length = 0
    const res = await req('POST', `/superadmin/restaurants/${id}/suspend`, SUPERADMIN)
    expect(res.status).toBe(200)

    const row = await admin.from('restaurants').select('active').eq('id', id).single()
    expect(row.data?.active).toBe(false)
    expect(broadcasts).toContainEqual({ restaurantId: id, event: 'suspension' })
    expect(kv.deletes).toContain(`menu:${id}`)
    expect(kv.deletes).toContain(`settings:${id}`)

    const audit = await admin
      .from('audit_log')
      .select('operation')
      .eq('restaurant_id', id)
      .eq('operation', 'SUSPEND')
      .maybeSingle()
    expect(audit.data?.operation).toBe('SUSPEND')
  })

  it('reactivate: active=true', async () => {
    const id = await createRestaurant(`${namePrefix} React`, false)
    const res = await req('POST', `/superadmin/restaurants/${id}/reactivate`, SUPERADMIN)
    expect(res.status).toBe(200)
    const row = await admin.from('restaurants').select('active').eq('id', id).single()
    expect(row.data?.active).toBe(true)
  })

  it('suspended restaurant owner calling any admin route: 403 account_suspended', async () => {
    const id = await createRestaurant(`${namePrefix} Owner`, false)
    const ownerToken = await token('restaurant_owner', id)
    const res = await req('GET', '/admin/whatever', ownerToken)
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('account_suspended')
  })

  it('non-superadmin: 403', async () => {
    const ownerToken = await token('restaurant_owner', randomUUID())
    const res = await req('GET', '/superadmin/restaurants', ownerToken)
    expect(res.status).toBe(403)
  })
})
