import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import type { Env } from '../../src/types'
import { SecretsService } from '../../src/services/secrets'
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

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Secrets service backed by the local Supabase Vault — used to seed smtp_config rows.
const secrets = new SecretsService({} as Env, admin)

/**
 * Fake TENANT_COUNTER DurableObjectNamespace.
 * status=200 → increment accepted (below limit).
 * status=429 → limit exceeded; body contains { count }.
 */
function fakeTenantCounter(status: 200 | 429 = 200): unknown {
  const count = status === 429 ? 500 : 1
  return {
    idFromName: (_name: string) => _name,
    get: (_id: unknown) => ({
      fetch: async (_url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        if (method === 'POST') {
          return new Response(JSON.stringify({ count }), { status })
        }
        return new Response(JSON.stringify({ count: 0 }), { status: 200 })
      },
    }),
  }
}

function makeEnv(counterStatus: 200 | 429 = 200): Env {
  return {
    SUPABASE_URL: API_URL,
    SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
    TENANT_COUNTER: fakeTenantCounter(counterStatus),
  } as unknown as Env
}

function recordingTransport(): { sent: EmailMessage[]; transport: EmailTransport } {
  const sent: EmailMessage[] = []
  return { sent, transport: { send: async (m) => void sent.push(m) } }
}

// Unique suffix prevents vault name collisions when tests are re-run without a db reset.
const testRunId = randomUUID().slice(0, 8)

let starterPlanId = ''
const restaurantIds: string[] = []
let globalConfigId = ''
let globalVaultId = ''

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

  // Global SMTP config — password stored in Vault under a test-run-unique name.
  globalVaultId = await secrets.put(`smtp:global:test:${testRunId}`, 'global-secret')
  const g = await admin
    .from('smtp_config')
    .insert({
      restaurant_id: null,
      host: 'smtp.global.example',
      port: 587,
      username: 'global@example.com',
      password_vault_id: globalVaultId,
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
  if (globalVaultId) await secrets.delete(globalVaultId).catch(() => {})
})

describe('STORY-039 · SMTP send service', () => {
  it('own SMTP found: used (decrypted), no counter touched, email_log written', async () => {
    const restaurantId = await createRestaurant()
    const ownVaultId = await secrets.put(`smtp:${restaurantId}:test:${testRunId}`, 'own-secret')
    const ins = await admin.from('smtp_config').insert({
      restaurant_id: restaurantId,
      host: 'smtp.own.example',
      port: 587,
      username: 'own@example.com',
      password_vault_id: ownVaultId,
      from_email: 'orders@own.example',
      from_name: 'Own Restaurant',
    })
    expect(ins.error).toBeNull()

    const { sent, transport } = recordingTransport()
    const svc = new SmtpService(makeEnv(), transport)

    const source = await svc.send({
      restaurant_id: restaurantId,
      to: 'guest@example.com',
      subject: 'Order received',
      html: '<p>Thanks</p>',
    })

    expect(source).toBe('own')
    expect(sent).toHaveLength(1)
    expect(sent[0]?.credentials.password).toBe('own-secret') // Vault round-trip
    expect(sent[0]?.credentials.host).toBe('smtp.own.example')

    const log = await admin
      .from('email_log')
      .select('smtp_source')
      .eq('restaurant_id', restaurantId)
      .single()
    expect(log.data?.smtp_source).toBe('own')
  })

  it('no own SMTP: fallback to global, counter incremented', async () => {
    const restaurantId = await createRestaurant()
    const { sent, transport } = recordingTransport()
    const svc = new SmtpService(makeEnv(), transport)

    const source = await svc.send({
      restaurant_id: restaurantId,
      to: 'guest@example.com',
      subject: 'Order received',
      html: '<p>Thanks</p>',
    })

    expect(source).toBe('global')
    expect(sent[0]?.credentials.password).toBe('global-secret')

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
    // fakeTenantCounter(429) simulates the DO returning 429 (limit exceeded).
    const svc = new SmtpService(makeEnv(429), transport)

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

  it('cc option: passed through to the transport as a single send', async () => {
    const restaurantId = await createRestaurant()
    const ownVaultId = await secrets.put(`smtp:${restaurantId}:cc:${testRunId}`, 'own-secret')
    await admin.from('smtp_config').insert({
      restaurant_id: restaurantId,
      host: 'smtp.own.example',
      port: 587,
      username: 'own@example.com',
      password_vault_id: ownVaultId,
      from_email: 'orders@own.example',
      from_name: 'Own Restaurant',
    })

    const { sent, transport } = recordingTransport()
    const svc = new SmtpService(makeEnv(), transport)

    await svc.send({
      restaurant_id: restaurantId,
      to: 'primary@example.com',
      cc: ['second@example.com', 'third@example.com'],
      subject: 'Internal notification',
      html: '<p>hi</p>',
    })

    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe('primary@example.com')
    expect(sent[0]?.cc).toEqual(['second@example.com', 'third@example.com'])
  })
})
