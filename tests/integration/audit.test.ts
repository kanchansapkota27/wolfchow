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

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
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
const ACTOR_NAME = `Auditor ${randomUUID().slice(0, 6)}`
let actorId = ''
let restaurantA = ''
let restaurantB = ''
const createdUserIds: string[] = []
const createdRestaurantIds: string[] = []
const createdAuditIds: string[] = []

async function createRestaurant(): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `audit-${randomUUID().slice(0, 8)}`,
      display_name: 'Audit Test',
      business_name: 'Audit LLC',
      timezone: 'Europe/Istanbul',
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdRestaurantIds.push(id)
  return id
}

async function insertAudit(fields: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('audit_log')
    .insert({ table_name: 'restaurants', operation: 'UPDATE', ...fields })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdAuditIds.push(id)
  return id
}

let oldRowId = ''

beforeAll(async () => {
  SUPERADMIN = await token('superadmin')

  // A real user so user_name resolves.
  const email = `auditor-${randomUUID().slice(0, 8)}@test.local`
  const created = await admin.auth.admin.createUser({ email, password: 'Password123!', email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed')
  actorId = created.data.user.id
  createdUserIds.push(actorId)
  const ins = await admin
    .from('users')
    .insert({ id: actorId, email, name: ACTOR_NAME, role: 'superadmin', restaurant_id: null, permissions: [] })
  if (ins.error) throw ins.error

  restaurantA = await createRestaurant()
  restaurantB = await createRestaurant()

  await insertAudit({ restaurant_id: restaurantA, operation: 'SUSPEND', user_id: actorId, new_data: { active: false } })
  await insertAudit({ restaurant_id: restaurantB, operation: 'REACTIVATE', user_id: actorId, new_data: { active: true } })
  oldRowId = await insertAudit({
    restaurant_id: restaurantA,
    operation: 'UPDATE',
    user_id: actorId,
    created_at: '2020-01-01T00:00:00Z',
  })
})

afterAll(async () => {
  for (const id of createdAuditIds) await admin.from('audit_log').delete().eq('id', id)
  for (const id of createdRestaurantIds) {
    await admin.from('audit_log').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id)
  }
  for (const id of createdUserIds) {
    await admin.from('users').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
})

interface Entry {
  id: string
  restaurant_id: string | null
  operation: string
  user_name: string | null
}

describe('STORY-011 · platform audit log', () => {
  it('returns audit entries across tenants', async () => {
    const res = await req('/superadmin/audit', SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { entries: Entry[]; page: number; page_size: number }
    expect(body.page_size).toBe(50)
    const ids = body.entries.map((e) => e.id)
    // Both freshly-seeded (newest) rows appear on page 1.
    expect(ids).toContain(createdAuditIds[0])
    expect(ids).toContain(createdAuditIds[1])
  })

  it('filter restaurant_id: only that restaurant', async () => {
    const res = await req(`/superadmin/audit?restaurant_id=${restaurantA}`, SUPERADMIN)
    const body = (await res.json()) as { entries: Entry[] }
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.every((e) => e.restaurant_id === restaurantA)).toBe(true)
  })

  it('filter date range: correct subset', async () => {
    const res = await req(
      `/superadmin/audit?restaurant_id=${restaurantA}&date_from=2019-12-31T00:00:00Z&date_to=2020-01-02T00:00:00Z`,
      SUPERADMIN,
    )
    const body = (await res.json()) as { entries: Entry[] }
    expect(body.entries.map((e) => e.id)).toEqual([oldRowId])
  })

  it('user_name resolved from users table', async () => {
    const res = await req(`/superadmin/audit/${restaurantB}`, SUPERADMIN)
    const body = (await res.json()) as { entries: Entry[] }
    expect(body.entries[0]?.user_name).toBe(ACTOR_NAME)
  })

  it('non-superadmin: 403', async () => {
    const res = await req('/superadmin/audit', await token('restaurant_owner'))
    expect(res.status).toBe(403)
  })
})
