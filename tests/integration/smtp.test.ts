import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Env } from '../../src/types'
import { EncryptionService } from '../../src/services/encryption'
import {
  SmtpLimitExceededError,
  SmtpService,
  type EmailMessage,
  type EmailTransport,
} from '../../src/services/smtp'

const API_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// Master key shared between seeding (encrypt) and the service (decrypt).
const MASTER = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
const encryption = new EncryptionService(MASTER)
const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const monthKey = new Date().toISOString().slice(0, 7)

function makeKv() {
  const store = new Map<string, string>()
  const puts: string[] = []
  const ns = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
      puts.push(key)
    },
  }
  return { store, puts, ns }
}

function makeEnv(kvNs: unknown): Env {
  return {
    SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    MASTER_ENCRYPTION_KEY: MASTER,
    SMTP_COUNTERS: kvNs,
  } as unknown as Env
}

function recordingTransport(): { sent: EmailMessage[]; transport: EmailTransport } {
  const sent: EmailMessage[] = []
  return { sent, transport: { send: async (m) => void sent.push(m) } }
}

let starterPlanId = ''
const restaurantIds: string[] = []
let globalConfigId = ''

async function createRestaurant(): Promise<string> {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `smtp-${randomUUID().slice(0, 8)}`,
      display_name: 'SMTP Test',
      business_name: 'SMTP Test LLC',
      timezone: 'Europe/Istanbul',
      plan_id: starterPlanId,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  restaurantIds.push(id)
  return id
}

beforeAll(async () => {
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  starterPlanId = plan.data.id as string

  // Single global SMTP config (restaurant_id NULL), password encrypted under "global".
  const sealedGlobal = await encryption.seal('global-secret', 'global')
  const g = await admin
    .from('smtp_config')
    .insert({
      restaurant_id: null,
      host: 'smtp.global.example',
      port: 587,
      username: 'global@example.com',
      encrypted_password: sealedGlobal,
      from_email: 'no-reply@example.com',
      from_name: 'Platform',
    })
    .select('id')
    .single()
  if (g.error) throw g.error
  globalConfigId = g.data.id as string
})

afterAll(async () => {
  for (const id of restaurantIds) {
    await admin.from('email_log').delete().eq('restaurant_id', id)
    await admin.from('audit_log').delete().eq('restaurant_id', id)
    await admin.from('restaurants').delete().eq('id', id) // cascades own smtp_config
  }
  if (globalConfigId) await admin.from('smtp_config').delete().eq('id', globalConfigId)
})

describe('STORY-039 · SMTP send service', () => {
  it('own SMTP found: used (decrypted), no KV counter touched, email_log written', async () => {
    const restaurantId = await createRestaurant()
    const sealed = await encryption.seal('own-secret', restaurantId)
    const ins = await admin.from('smtp_config').insert({
      restaurant_id: restaurantId,
      host: 'smtp.own.example',
      port: 587,
      username: 'own@example.com',
      encrypted_password: sealed,
      from_email: 'orders@own.example',
      from_name: 'Own Restaurant',
    })
    expect(ins.error).toBeNull()

    const { sent, transport } = recordingTransport()
    const kv = makeKv()
    const svc = new SmtpService(makeEnv(kv.ns), transport)

    const source = await svc.send({
      restaurant_id: restaurantId,
      to: 'guest@example.com',
      subject: 'Order received',
      html: '<p>Thanks</p>',
    })

    expect(source).toBe('own')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.credentials.password).toBe('own-secret') // decrypt round trip
    expect(sent[0]?.credentials.host).toBe('smtp.own.example')
    expect(kv.puts).toHaveLength(0) // own SMTP: no counter touched

    const log = await admin
      .from('email_log')
      .select('smtp_source')
      .eq('restaurant_id', restaurantId)
      .single()
    expect(log.data?.smtp_source).toBe('own')
  })

  it('no own SMTP: fallback to global, KV counter incremented', async () => {
    const restaurantId = await createRestaurant()
    const { sent, transport } = recordingTransport()
    const kv = makeKv()
    const svc = new SmtpService(makeEnv(kv.ns), transport)

    const source = await svc.send({
      restaurant_id: restaurantId,
      to: 'guest@example.com',
      subject: 'Order received',
      html: '<p>Thanks</p>',
    })

    expect(source).toBe('global')
    expect(sent[0]?.credentials.password).toBe('global-secret')
    expect(kv.store.get(`smtp:${restaurantId}:${monthKey}`)).toBe('1')

    const log = await admin
      .from('email_log')
      .select('smtp_source')
      .eq('restaurant_id', restaurantId)
      .single()
    expect(log.data?.smtp_source).toBe('global')
  })

  it('counter at limit: SmtpLimitExceededError thrown, no email sent, audit written', async () => {
    const restaurantId = await createRestaurant()
    const { sent, transport } = recordingTransport()
    const kv = makeKv()
    // Starter plan limit is 500 — pre-set the counter to the cap.
    kv.store.set(`smtp:${restaurantId}:${monthKey}`, '500')
    const svc = new SmtpService(makeEnv(kv.ns), transport)

    await expect(
      svc.send({
        restaurant_id: restaurantId,
        to: 'guest@example.com',
        subject: 'Order received',
        html: '<p>Thanks</p>',
      }),
    ).rejects.toBeInstanceOf(SmtpLimitExceededError)

    expect(sent).toHaveLength(0) // no email sent

    const audit = await admin
      .from('audit_log')
      .select('new_data')
      .eq('restaurant_id', restaurantId)
      .eq('table_name', 'smtp_config')
      .single()
    expect((audit.data?.new_data as { event: string }).event).toBe('smtp_limit_exceeded')
  })
})
