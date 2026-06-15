import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac, randomUUID } from 'node:crypto'

// Local Supabase defaults (well-known demo keys, safe to commit). Overridable via
// env so CI can point at its own stack.
const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ??
  'super-secret-jwt-token-with-at-least-32-characters-long'

// Mint a Supabase-compatible HS256 JWT carrying a restaurant_id claim so RLS
// policies (auth.jwt() ->> 'restaurant_id') resolve to a specific tenant.
function signJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(
    JSON.stringify({ aud: 'authenticated', role: 'authenticated', iat: now, exp: now + 3600, ...claims }),
  ).toString('base64url')
  const data = `${header}.${payload}`
  const signature = createHmac('sha256', JWT_SECRET).update(data).digest('base64url')
  return `${data}.${signature}`
}

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Anon-key client whose Authorization bearer is a tenant-scoped JWT. PostgREST
// uses the bearer token for role + claims, so RLS applies as that restaurant.
function userClient(restaurantId: string): SupabaseClient {
  const jwt = signJwt({ sub: randomUUID(), restaurant_id: restaurantId })
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}

let restaurantIdA = ''
let restaurantIdB = ''
let itemIdA = ''

async function seedTenant(label: string): Promise<{ restaurantId: string; itemId: string }> {
  const { data: r, error: rErr } = await admin
    .from('restaurants')
    .insert({
      slug: `rls-${label}-${Date.now()}-${randomUUID().slice(0, 8)}`,
      display_name: `Restaurant ${label}`,
      business_name: `Restaurant ${label} LLC`,
      timezone: 'Europe/Istanbul',
    })
    .select('id')
    .single()
  if (rErr) throw rErr
  const restaurantId = r.id as string

  const { data: cat, error: cErr } = await admin
    .from('menu_categories')
    .insert({ restaurant_id: restaurantId, name: `Mains ${label}` })
    .select('id')
    .single()
  if (cErr) throw cErr

  const { data: item, error: iErr } = await admin
    .from('menu_items')
    .insert({
      restaurant_id: restaurantId,
      category_id: cat.id,
      name: `Burger ${label}`,
      price: 9.99,
    })
    .select('id')
    .single()
  if (iErr) throw iErr

  return { restaurantId, itemId: item.id as string }
}

beforeAll(async () => {
  const a = await seedTenant('A')
  const b = await seedTenant('B')
  restaurantIdA = a.restaurantId
  restaurantIdB = b.restaurantId
  itemIdA = a.itemId
})

afterAll(async () => {
  // cascade deletes categories/items/audit rows belonging to these restaurants
  if (restaurantIdA) await admin.from('restaurants').delete().eq('id', restaurantIdA)
  if (restaurantIdB) await admin.from('restaurants').delete().eq('id', restaurantIdB)
})

describe('STORY-002 · database schema + RLS baseline', () => {
  it('restaurant A user cannot read restaurant B rows', async () => {
    const clientA = userClient(restaurantIdA)
    const { data, error } = await clientA.from('menu_items').select('*')
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
    expect((data ?? []).every((item) => item.restaurant_id === restaurantIdA)).toBe(true)
    expect((data ?? []).some((item) => item.restaurant_id === restaurantIdB)).toBe(false)
  })

  it('service role can read across all tenants', async () => {
    const { data, error } = await admin.from('menu_items').select('restaurant_id')
    expect(error).toBeNull()
    const restaurantIds = new Set((data ?? []).map((i) => i.restaurant_id))
    expect(restaurantIds.size).toBeGreaterThan(1)
  })

  it('audit trigger fires on menu_item UPDATE', async () => {
    const { error: updateError } = await admin
      .from('menu_items')
      .update({ name: 'Test' })
      .eq('id', itemIdA)
    expect(updateError).toBeNull()

    const { data, error } = await admin
      .from('audit_log')
      .select('*')
      .eq('table_name', 'menu_items')
      .eq('operation', 'UPDATE')
      .eq('restaurant_id', restaurantIdA)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    expect(error).toBeNull()
    expect(data?.operation).toBe('UPDATE')
    expect(data?.new_data?.name).toBe('Test')
  })
})
