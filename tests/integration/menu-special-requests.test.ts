import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerPublicMenuRoutes } from '../../src/routes/public/menu'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const app = new Hono<HonoEnv>()
registerPublicMenuRoutes(app)

function fakeKv() {
  return { get: async () => null, put: async () => {}, delete: async () => {} }
}

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  MENU_CACHE: fakeKv(),
  SETTINGS_CACHE: fakeKv(),
  RATE_LIMITER_PUBLIC: { limit: async () => ({ success: true }) },
} as unknown as Env

const restaurantIds: string[] = []

afterAll(async () => {
  if (restaurantIds.length) await admin.from('restaurants').delete().in('id', restaurantIds)
})

describe('STORY-096 · special_requests_enabled resolution on public menu', () => {
  it('item override wins over the restaurant default; unset items inherit it', async () => {
    const slug = `special-req-test-${randomUUID().slice(0, 8)}`
    const { data: r, error: rErr } = await admin
      .from('restaurants')
      .insert({
        slug,
        display_name: 'Special Req Test',
        business_name: 'Special Req Test LLC',
        timezone: 'UTC',
        special_requests_enabled: true,
      })
      .select('id')
      .single()
    if (rErr) throw rErr
    const restaurantId = r.id as string
    restaurantIds.push(restaurantId)

    const { data: cat, error: cErr } = await admin
      .from('menu_categories')
      .insert({ restaurant_id: restaurantId, name: 'Mains' })
      .select('id')
      .single()
    if (cErr) throw cErr

    const { error: iErr } = await admin.from('menu_items').insert([
      { restaurant_id: restaurantId, category_id: cat.id, name: 'Inherits Default', price: 500, special_requests_enabled: null },
      { restaurant_id: restaurantId, category_id: cat.id, name: 'Explicitly Off', price: 500, special_requests_enabled: false },
    ])
    if (iErr) throw iErr

    const res = await app.request(`/public/${slug}/menu`, {}, env)
    expect(res.status).toBe(200)

    const body = await res.json() as {
      categories: Array<{ items: Array<{ name: string; special_requests_enabled: boolean }> }>
    }
    const items = body.categories[0]!.items
    const inherits = items.find((i) => i.name === 'Inherits Default')!
    const explicitOff = items.find((i) => i.name === 'Explicitly Off')!

    expect(inherits.special_requests_enabled).toBe(true)
    expect(explicitOff.special_requests_enabled).toBe(false)
  })
})
