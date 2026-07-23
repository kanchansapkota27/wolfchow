import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Env } from '../../src/types'
import { runAutoReject } from '../../src/services/cron'
import type { Broadcaster, EventType } from '../../src/services/realtime'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
} as unknown as Env

const broadcasts: Array<{ restaurantId: string; event: EventType }> = []
const fakeBroadcaster: Broadcaster = {
  broadcast: (restaurantId, event) => void broadcasts.push({ restaurantId, event }),
}
// runAutoReject constructs its own RealtimeService(env) internally rather than
// taking a broadcaster — it's exercised for real here, no mock needed for it.
void fakeBroadcaster

const restaurantIds: string[] = []
const orderIds: string[] = []
let starterPlanId = ''

async function createRestaurant(autoRejectMinutes: number): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `cron-${randomUUID().slice(0, 8)}`,
      display_name: 'Cron Test',
      business_name: 'Cron Test LLC',
      timezone: 'UTC',
      plan_id: starterPlanId,
      auto_reject_enabled: true,
      auto_reject_minutes: autoRejectMinutes,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  restaurantIds.push(id)
  return id
}

async function createAuthSuccessOrder(restaurantId: string, opts: { createdAt: string; scheduledFor?: string | null }): Promise<string> {
  const { data, error } = await admin
    .from('orders')
    .insert({
      restaurant_id: restaurantId,
      tracking_token: `ord_live_${randomUUID().replace(/-/g, '')}`,
      status: 'auth_success',
      payment_method: 'pickup',
      payment_status: 'authorized',
      customer_name: 'Cron Test Customer',
      customer_email: 'cron-test@example.com',
      subtotal: 10,
      total: 10,
      created_at: opts.createdAt,
      scheduled_for: opts.scheduledFor ?? null,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  orderIds.push(id)
  // created_at has a DB default (now()) that insert() takes precedence over,
  // but confirm it actually stuck — a silent default-wins would invalidate the
  // test. Compare by instant, not string: PostgREST round-trips with a
  // "+00:00" offset suffix instead of the "Z" this file sends.
  const { data: check } = await admin.from('orders').select('created_at').eq('id', id).single()
  if (new Date((check as { created_at: string }).created_at).getTime() !== new Date(opts.createdAt).getTime()) {
    throw new Error('created_at override did not persist — test fixture invalid')
  }
  return id
}

beforeAll(async () => {
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  starterPlanId = plan.data.id as string
})

afterAll(async () => {
  if (orderIds.length) await admin.from('orders').delete().in('id', orderIds)
  if (restaurantIds.length) await admin.from('restaurants').delete().in('id', restaurantIds)
})

describe('STORY-087 · runAutoReject scheduled-order exemption', () => {
  it('non-scheduled order past cutoff: auto-rejected', async () => {
    const restaurantId = await createRestaurant(15)
    const oldCreatedAt = new Date(Date.now() - 30 * 60_000).toISOString()
    const orderId = await createAuthSuccessOrder(restaurantId, { createdAt: oldCreatedAt })

    await runAutoReject(env, { waitUntil: () => {} } as unknown as ExecutionContext)

    const { data } = await admin.from('orders').select('status').eq('id', orderId).single()
    expect((data as { status: string }).status).toBe('rejected')
  })

  it('scheduled order for tomorrow, placed long ago: NOT auto-rejected despite old created_at', async () => {
    const restaurantId = await createRestaurant(15)
    const oldCreatedAt = new Date(Date.now() - 30 * 60_000).toISOString()
    const futureScheduledFor = new Date(Date.now() + 24 * 60 * 60_000).toISOString()
    const orderId = await createAuthSuccessOrder(restaurantId, { createdAt: oldCreatedAt, scheduledFor: futureScheduledFor })

    await runAutoReject(env, { waitUntil: () => {} } as unknown as ExecutionContext)

    const { data } = await admin.from('orders').select('status').eq('id', orderId).single()
    expect((data as { status: string }).status).toBe('auth_success')
  })

  it('scheduled order whose slot already passed: auto-reject cutoff applies again', async () => {
    const restaurantId = await createRestaurant(15)
    const oldCreatedAt = new Date(Date.now() - 30 * 60_000).toISOString()
    const pastScheduledFor = new Date(Date.now() - 60 * 60_000).toISOString()
    const orderId = await createAuthSuccessOrder(restaurantId, { createdAt: oldCreatedAt, scheduledFor: pastScheduledFor })

    await runAutoReject(env, { waitUntil: () => {} } as unknown as ExecutionContext)

    const { data } = await admin.from('orders').select('status').eq('id', orderId).single()
    expect((data as { status: string }).status).toBe('rejected')
  })
})
