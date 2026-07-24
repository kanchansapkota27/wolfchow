import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Env } from '../../src/types'
import { SecretsService } from '../../src/services/secrets'
import { NotificationService, type NotificationOrder } from '../../src/services/notifications'
import type { EmailMessage, EmailTransport } from '../../src/services/smtp'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const secrets = new SecretsService({} as Env, admin)

function recordingTransport(): { sent: EmailMessage[]; transport: EmailTransport } {
  const sent: EmailMessage[] = []
  return { sent, transport: { send: async (m) => void sent.push(m) } }
}

function makeEnv(): Env {
  return {
    SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TENANT_COUNTER: { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(JSON.stringify({ count: 0 }), { status: 200 }) }) },
    WIDGET_BASE_URL: 'https://widget.test',
  } as unknown as Env
}

const testRunId = randomUUID().slice(0, 8)
let starterPlanId = ''
const restaurantIds: string[] = []

async function createRestaurant(): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `notif-${randomUUID().slice(0, 8)}`,
      display_name: 'Notif Test',
      business_name: 'Notif Test LLC',
      timezone: 'UTC',
      plan_id: starterPlanId,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  restaurantIds.push(id)

  const vaultId = await secrets.put(`smtp:${id}:notif:${testRunId}`, 'own-secret')
  await admin.from('smtp_config').insert({
    restaurant_id: id,
    host: 'smtp.own.example',
    port: 587,
    username: 'own@example.com',
    password_vault_id: vaultId,
    from_email: 'orders@own.example',
    from_name: 'Notif Test',
  })
  return id
}

function order(overrides: Partial<NotificationOrder> = {}): NotificationOrder {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-000000000001',
    tracking_token: 'tok_test',
    customer_name: 'Jane Doe',
    customer_email: 'jane@example.com',
    total: 24.5,
    payment_method: 'card',
    notes: null,
    scheduled_for: null,
    ...overrides,
  }
}

beforeAll(async () => {
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  starterPlanId = plan.data.id as string
})

afterAll(async () => {
  for (const id of restaurantIds) {
    await admin.from('email_log').delete().eq('restaurant_id', id)
    await admin.from('notification_config').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id)
  }
})

describe('STORY-102 · internal recipients get one CC\'d email, not N separate sends', () => {
  it('2 internal recipients configured: exactly one email sent, first is "to", rest are "cc"', async () => {
    const restaurantId = await createRestaurant()
    await admin.from('notification_config').insert({
      restaurant_id: restaurantId,
      trigger_status: 'accepted',
      send_customer: false,
      internal_recipients: ['owner@example.com', 'kitchen@example.com'],
    })

    const { sent, transport } = recordingTransport()
    const svc = new NotificationService(makeEnv(), transport)
    await svc.sendOrderAccepted(restaurantId, order())

    // Only the internal send happens (send_customer is false)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('owner@example.com')
    expect(sent[0]?.cc).toEqual(['kitchen@example.com'])
    expect(sent[0]?.subject).toContain('[Internal]')
  })

  it('1 internal recipient configured: single send, no cc key', async () => {
    const restaurantId = await createRestaurant()
    await admin.from('notification_config').insert({
      restaurant_id: restaurantId,
      trigger_status: 'accepted',
      send_customer: false,
      internal_recipients: ['owner@example.com'],
    })

    const { sent, transport } = recordingTransport()
    const svc = new NotificationService(makeEnv(), transport)
    await svc.sendOrderAccepted(restaurantId, order())

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('owner@example.com')
    expect(sent[0]?.cc).toBeUndefined()
  })

  it('sendOrderCompleted: internal recipients notified (previously unimplemented)', async () => {
    const restaurantId = await createRestaurant()
    await admin.from('notification_config').insert({
      restaurant_id: restaurantId,
      trigger_status: 'completed',
      send_customer: false,
      internal_recipients: ['owner@example.com'],
    })

    const { sent, transport } = recordingTransport()
    const svc = new NotificationService(makeEnv(), transport)
    await svc.sendOrderCompleted(restaurantId, order())

    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toContain('completed')
  })

  it('sendOrderRefunded: internal recipients notified with the refund amount (previously unimplemented)', async () => {
    const restaurantId = await createRestaurant()
    await admin.from('notification_config').insert({
      restaurant_id: restaurantId,
      trigger_status: 'refunded',
      send_customer: false,
      internal_recipients: ['owner@example.com'],
    })

    const { sent, transport } = recordingTransport()
    const svc = new NotificationService(makeEnv(), transport)
    await svc.sendOrderRefunded(restaurantId, order(), 12.25)

    expect(sent).toHaveLength(1)
    expect(sent[0]?.html).toContain('$12.25')
  })
})
