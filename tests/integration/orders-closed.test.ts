import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerPublicOrderRoutes } from '../../src/routes/public/orders'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const app = new Hono<HonoEnv>()
registerPublicOrderRoutes(app)

function fakeKv() {
  return { get: async () => null, put: async () => {}, delete: async () => {} }
}

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  MENU_CACHE: fakeKv(),
  SETTINGS_CACHE: fakeKv(),
  RATE_LIMITER_ORDER: { limit: async () => ({ success: true }) },
} as unknown as Env

// Order creation broadcasts a realtime event via c.executionCtx.waitUntil for
// non-card payments — needs a stub since app.request() has no real one.
const fakeExecutionCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

// Growth allows pickup + card and has scheduled_orders_enabled — Starter
// only allows card, which would need a Stripe setup this test doesn't need.
let growthPlanId = ''
const restaurantIds: string[] = []
const orderIds: string[] = []

async function createRestaurantWithItem(): Promise<{ restaurantId: string; slug: string; itemId: string }> {
  const slug = `closed-test-${randomUUID().slice(0, 8)}`
  const { data: r, error: rErr } = await admin
    .from('restaurants')
    .insert({
      slug,
      display_name: 'Closed Test',
      business_name: 'Closed Test LLC',
      timezone: 'UTC',
      plan_id: growthPlanId,
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

  const { data: item, error: iErr } = await admin
    .from('menu_items')
    .insert({ restaurant_id: restaurantId, category_id: cat.id, name: 'Burger', price: 999 })
    .select('id')
    .single()
  if (iErr) throw iErr

  return { restaurantId, slug, itemId: item.id as string }
}

/**
 * A real (non-degenerate) 1-minute open window at 03:00 UTC every day —
 * guaranteed "closed" at whatever arbitrary time this test happens to run
 * (unless it's the literal minute of 03:00 UTC), while still having a
 * genuine next opening within 24h for next_open to resolve to.
 */
async function setHoursOpenOnlyAt3am(restaurantId: string): Promise<void> {
  const rows = Array.from({ length: 7 }, (_, day_of_week) => ({
    restaurant_id: restaurantId,
    day_of_week,
    open_time: '03:00',
    close_time: '03:02',
    active: true,
    last_order_offset_minutes: 0,
    crosses_midnight: false,
  }))
  const { error } = await admin.from('operating_hours').insert(rows)
  if (error) throw error
}

function orderPayload(itemId: string) {
  return {
    customer_name: 'Test Customer',
    customer_email: 'closed-test@example.com',
    payment_method: 'pickup',
    items: [{ item_id: itemId, quantity: 1, modifiers: [] }],
  }
}

beforeAll(async () => {
  const plan = await admin.from('plans').select('id').eq('name', 'Growth').single()
  if (plan.error) throw plan.error
  growthPlanId = plan.data.id as string
})

afterAll(async () => {
  if (orderIds.length) await admin.from('orders').delete().in('id', orderIds)
  if (restaurantIds.length) await admin.from('restaurants').delete().in('id', restaurantIds)
})

describe('STORY-093 · restaurant-closed detection on order creation', () => {
  it('no operating_hours configured: order accepted (default open)', async () => {
    const { slug, itemId } = await createRestaurantWithItem()

    const res = await app.request(`/public/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload(itemId)),
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(201)
    const body = await res.json() as { order_id: string }
    orderIds.push(body.order_id)
  })

  it('operating_hours configured, currently outside them: 503 restaurant_closed with next_open', async () => {
    const { restaurantId, slug, itemId } = await createRestaurantWithItem()
    await setHoursOpenOnlyAt3am(restaurantId)

    const res = await app.request(`/public/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload(itemId)),
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(503)
    const body = await res.json() as { error: string; next_open: string | null }
    expect(body.error).toBe('restaurant_closed')
    expect(body.next_open).not.toBeNull()
  })

  it('scheduled order: bypasses the closed check even when currently closed', async () => {
    const { restaurantId, slug, itemId } = await createRestaurantWithItem()
    await setHoursOpenOnlyAt3am(restaurantId)

    const res = await app.request(`/public/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...orderPayload(itemId), scheduled_for: new Date(Date.now() + 86_400_000).toISOString() }),
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(201)
    const body = await res.json() as { order_id: string }
    orderIds.push(body.order_id)
  })
})
