import { afterAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Env } from '../../src/types'
import { runDeviceOfflineAlert } from '../../src/services/cron'
import type { NotificationService } from '../../src/services/notifications'

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

const restaurantIds: string[] = []
const userIds: string[] = []

function fakeNotifier(): { calls: Array<{ restaurantId: string; restaurantName: string; ownerEmail: string }>; notifier: (env: Env) => NotificationService } {
  const calls: Array<{ restaurantId: string; restaurantName: string; ownerEmail: string }> = []
  const fake = {
    sendDeviceOfflineAlert: async (restaurantId: string, restaurantName: string, ownerEmail: string) => {
      calls.push({ restaurantId, restaurantName, ownerEmail })
    },
  } as unknown as NotificationService
  return { calls, notifier: () => fake }
}

async function createRestaurantWithOwner(displayName: string): Promise<{ restaurantId: string; ownerEmail: string }> {
  const { data: r, error } = await admin
    .from('restaurants')
    .insert({
      slug: `dev-offline-${randomUUID().slice(0, 8)}`,
      display_name: displayName,
      business_name: `${displayName} LLC`,
      timezone: 'UTC',
    })
    .select('id')
    .single()
  if (error) throw error
  const restaurantId = r.id as string
  restaurantIds.push(restaurantId)

  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@test.local`
  const created = await admin.auth.admin.createUser({ email: ownerEmail, password: 'Password123!', email_confirm: true })
  if (created.error || !created.data.user) throw created.error ?? new Error('createUser failed')
  const userId = created.data.user.id
  userIds.push(userId)
  await admin.from('users').insert({
    id: userId,
    email: ownerEmail,
    name: 'Owner',
    role: 'restaurant_owner',
    restaurant_id: restaurantId,
    active: true,
  })

  return { restaurantId, ownerEmail }
}

async function addDevice(restaurantId: string, lastSeenAt: string | null): Promise<void> {
  await admin.from('devices').insert({
    restaurant_id: restaurantId,
    name: 'Kitchen iPad',
    last_seen_at: lastSeenAt,
  })
}

afterAll(async () => {
  for (const id of restaurantIds) {
    await admin.from('devices').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id)
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id)
  }
})

describe('STORY-102 · runDeviceOfflineAlert', () => {
  it('all devices offline > 2 minutes: owner emailed once, sent_at recorded', async () => {
    const { restaurantId, ownerEmail } = await createRestaurantWithOwner('All Offline Diner')
    await addDevice(restaurantId, new Date(Date.now() - 10 * 60_000).toISOString())

    const { calls, notifier } = fakeNotifier()
    await runDeviceOfflineAlert(env, notifier)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.restaurantId).toBe(restaurantId)
    expect(calls[0]?.ownerEmail).toBe(ownerEmail)

    const { data } = await admin.from('restaurants').select('device_offline_alert_sent_at').eq('id', restaurantId).single()
    expect(data?.device_offline_alert_sent_at).not.toBeNull()
  })

  it('already alerted for this outage: not re-sent on the next tick', async () => {
    const { restaurantId } = await createRestaurantWithOwner('Already Alerted Diner')
    await addDevice(restaurantId, new Date(Date.now() - 10 * 60_000).toISOString())
    await admin.from('restaurants').update({ device_offline_alert_sent_at: new Date().toISOString() }).eq('id', restaurantId)

    const { calls, notifier } = fakeNotifier()
    await runDeviceOfflineAlert(env, notifier)

    expect(calls).toHaveLength(0)
  })

  it('at least one device online: no alert, and a stale alert flag is cleared', async () => {
    const { restaurantId } = await createRestaurantWithOwner('Back Online Diner')
    await addDevice(restaurantId, new Date(Date.now() - 20 * 60_000).toISOString()) // stale
    await addDevice(restaurantId, new Date(Date.now() - 1 * 60_000).toISOString())  // recent
    await admin.from('restaurants').update({ device_offline_alert_sent_at: new Date().toISOString() }).eq('id', restaurantId)

    const { calls, notifier } = fakeNotifier()
    await runDeviceOfflineAlert(env, notifier)

    expect(calls).toHaveLength(0)
    const { data } = await admin.from('restaurants').select('device_offline_alert_sent_at').eq('id', restaurantId).single()
    expect(data?.device_offline_alert_sent_at).toBeNull()
  })

  it('restaurant has never configured any device: not alerted', async () => {
    const { restaurantId } = await createRestaurantWithOwner('No Devices Diner')
    // no devices inserted

    const { calls, notifier } = fakeNotifier()
    await runDeviceOfflineAlert(env, notifier)

    expect(calls.some((c) => c.restaurantId === restaurantId)).toBe(false)
  })

  it('revoked device is ignored — treated the same as not existing', async () => {
    const { restaurantId } = await createRestaurantWithOwner('Revoked Device Diner')
    await admin.from('devices').insert({
      restaurant_id: restaurantId,
      name: 'Old iPad',
      last_seen_at: new Date(Date.now() - 1 * 60_000).toISOString(), // recent, but revoked
      revoked_at: new Date().toISOString(),
    })

    const { calls, notifier } = fakeNotifier()
    await runDeviceOfflineAlert(env, notifier)

    expect(calls.some((c) => c.restaurantId === restaurantId)).toBe(false)
  })
})
