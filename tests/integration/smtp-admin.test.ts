import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerSuperadminRoutes } from '../../src/routes/superadmin'
import { SecretsService } from '../../src/services/secrets'
import { SmtpService, type EmailMessage, type EmailTransport } from '../../src/services/smtp'
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

// Vault-backed secrets service for the local Supabase instance.
const secrets = new SecretsService({} as Env, admin)

/**
 * Fake TENANT_COUNTER DurableObjectNamespace.
 * The smtp routes call TENANT_COUNTER.get(...).fetch() to read the monthly
 * counter. Returns 200 with count=0 for GET and count=1 for POST (below limit).
 */
function fakeTenantCounter(): unknown {
  return {
    idFromName: (_name: string) => _name,
    get: (_id: unknown) => ({
      fetch: async (_url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET'
        const body = method === 'POST' ? { count: 1 } : { count: 0 }
        return new Response(JSON.stringify(body), { status: 200 })
      },
    }),
  }
}

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  TENANT_COUNTER: fakeTenantCounter(),
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

function req(method: string, path: string, bearer: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${bearer}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, env)
}

function recordingTransport(): { sent: EmailMessage[]; transport: EmailTransport } {
  const sent: EmailMessage[] = []
  return { sent, transport: { send: async (m) => void sent.push(m) } }
}

let SUPERADMIN = ''
let starterPlanId = ''
let restaurantId = ''
let globalConfigId = ''
let globalVaultId = ''

beforeAll(async () => {
  SUPERADMIN = await token('superadmin')
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  starterPlanId = plan.data.id as string
  const r = await admin
    .from('restaurants')
    .insert({
      slug: `smtpadmin-${randomUUID().slice(0, 8)}`,
      display_name: 'SMTP Admin Test',
      business_name: 'SMTP Admin LLC',
      timezone: 'Europe/Istanbul',
      plan_id: starterPlanId,
    })
    .select('id')
    .single()
  if (r.error) throw r.error
  restaurantId = r.data.id as string
})

afterAll(async () => {
  await admin.from('smtp_config').delete().eq('restaurant_id', restaurantId)
  await admin.from('restaurants').delete().eq('id', restaurantId)
  if (globalConfigId) await admin.from('smtp_config').delete().eq('id', globalConfigId)
  if (globalVaultId) await secrets.delete(globalVaultId).catch(() => {})
})

describe('STORY-009 · global SMTP configuration', () => {
  it('set global SMTP: password stored in Vault, plaintext absent from smtp_config', async () => {
    const res = await req('POST', '/superadmin/smtp/global', SUPERADMIN, {
      host: 'smtp.global.test',
      port: 587,
      username: 'global@test.local',
      password: 'global-plaintext-secret',
      from_email: 'no-reply@test.local',
      from_name: 'Platform',
    })
    expect(res.status).toBe(201)

    const row = await admin
      .from('smtp_config')
      .select('id, password_vault_id')
      .is('restaurant_id', null)
      .limit(1)
      .single()
    globalConfigId = row.data?.id as string
    globalVaultId = row.data?.password_vault_id as string
    expect(globalVaultId).toBeTruthy()

    // Verify password round-trips through Vault correctly.
    const plaintext = await secrets.get(globalVaultId)
    expect(plaintext).toBe('global-plaintext-secret')
  })

  it('GET global SMTP: has_password=true, no password field', async () => {
    const res = await req('GET', '/superadmin/smtp/global', SUPERADMIN)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { config: Record<string, unknown> }
    expect(body.config.has_password).toBe(true)
    expect(body.config).not.toHaveProperty('password')
    expect(body.config).not.toHaveProperty('password_vault_id')
  })

  it('set restaurant override: stored with monthly_limit', async () => {
    const res = await req('POST', `/superadmin/smtp/restaurants/${restaurantId}`, SUPERADMIN, {
      host: 'smtp.own.test',
      port: 465,
      username: 'own@test.local',
      password: 'own-secret',
      from_email: 'orders@test.local',
      from_name: 'Own',
      monthly_limit: 1000,
    })
    expect(res.status).toBe(201)

    const get = await req('GET', `/superadmin/smtp/restaurants/${restaurantId}`, SUPERADMIN)
    const body = (await get.json()) as { config: { monthly_limit: number; has_password: boolean; monthly_used: number } }
    expect(body.config.monthly_limit).toBe(1000)
    expect(body.config.has_password).toBe(true)
    expect(body.config.monthly_used).toBe(0)
  })

  it('delete override: smtp_source resolves to global', async () => {
    const del = await req('DELETE', `/superadmin/smtp/restaurants/${restaurantId}`, SUPERADMIN)
    expect(del.status).toBe(204)

    // With no own row, SmtpService should fall back to the global config.
    const { sent, transport } = recordingTransport()
    const svc = new SmtpService(env, transport)
    const source = await svc.send({
      restaurant_id: restaurantId,
      to: 'guest@test.local',
      subject: 'x',
      html: '<p>x</p>',
    })
    expect(source).toBe('global')
    expect(sent[0]?.credentials.password).toBe('global-plaintext-secret')

    await admin.from('email_log').delete().eq('restaurant_id', restaurantId)
  })

  it('non-superadmin: 403', async () => {
    const res = await req('GET', '/superadmin/smtp/global', await token('restaurant_owner'))
    expect(res.status).toBe(403)
  })
})
