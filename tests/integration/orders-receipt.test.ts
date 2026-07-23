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

const fakeExecutionCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext

let growthPlanId = ''
const restaurantIds: string[] = []
const orderIds: string[] = []

beforeAll(async () => {
  const plan = await admin.from('plans').select('id').eq('name', 'Growth').single()
  if (plan.error) throw plan.error
  growthPlanId = plan.data.id as string
})

afterAll(async () => {
  if (orderIds.length) await admin.from('orders').delete().in('id', orderIds)
  if (restaurantIds.length) await admin.from('restaurants').delete().in('id', restaurantIds)
})

describe('STORY-094 · full itemized receipt on order creation', () => {
  it('returns items, subtotal, tax_amount, and tip_amount alongside the order total', async () => {
    const slug = `receipt-test-${randomUUID().slice(0, 8)}`
    const { data: r, error: rErr } = await admin
      .from('restaurants')
      .insert({
        slug,
        display_name: 'Receipt Test',
        business_name: 'Receipt Test LLC',
        timezone: 'UTC',
        plan_id: growthPlanId,
        tax_enabled: true,
        tax_rate: 10,
        tax_inclusive: false,
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
      .insert({ restaurant_id: restaurantId, category_id: cat.id, name: 'Burger', price: 1000 })
      .select('id')
      .single()
    if (iErr) throw iErr

    const res = await app.request(`/public/${slug}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Test Customer',
        customer_email: 'receipt-test@example.com',
        payment_method: 'pickup',
        tip_amount: 2,
        items: [{ item_id: item.id as string, quantity: 2, modifiers: [] }],
      }),
    }, env, fakeExecutionCtx)

    expect(res.status).toBe(201)
    const body = await res.json() as {
      order_id: string
      items: Array<{ item_name: string; quantity: number; unit_price: number; modifiers: unknown[] }>
      subtotal: number
      tax_amount: number
      tax_inclusive: boolean
      tip_amount: number
      promo_discount: number
      total: number
    }
    orderIds.push(body.order_id)

    expect(body.items).toEqual([
      { item_name: 'Burger', variant_name: null, quantity: 2, unit_price: 10, modifiers: [], notes: null },
    ])
    expect(body.subtotal).toBe(20)
    expect(body.tax_amount).toBe(2) // 10% of 20
    expect(body.tax_inclusive).toBe(false)
    expect(body.tip_amount).toBe(2)
    expect(body.promo_discount).toBe(0)
    expect(body.total).toBe(24) // subtotal + tax + tip
  })
})
