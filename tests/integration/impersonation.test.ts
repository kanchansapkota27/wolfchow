import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerSuperadminRoutes } from '../../src/routes/superadmin'
import { registerAuthRoutes } from '../../src/routes/auth'
import { jwtMiddleware } from '../../src/middleware/jwt'
import { requireNotImpersonating } from '../../src/middleware/guards'
import { decodeJwtClaims, signJwt } from '../../src/services/tokens'

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

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
} as unknown as Env

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)
registerAuthRoutes(app)
// Representative Slice-2 admin route to prove the requireNotImpersonating guard
// (the real /admin/payments/* routes apply this same guard in Slice 2).
app.patch('/admin/payments/stripe', jwtMiddleware, requireNotImpersonating('stripe_update'), (c) =>
  c.json({ ok: true }),
)

async function token(role: string, restaurantId: string | null = null): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: randomUUID(),
      role,
      restaurant_id: restaurantId,
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

let restaurantId = ''

beforeAll(async () => {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `imp-${randomUUID().slice(0, 8)}`,
      display_name: 'Impersonation Test',
      business_name: 'Imp Test LLC',
      timezone: 'Europe/Istanbul',
    })
    .select('id')
    .single()
  if (error) throw error
  restaurantId = data.id as string
})

afterAll(async () => {
  await admin.from('audit_log').delete().eq('restaurant_id', restaurantId)
  await admin.from('restaurants').delete().eq('id', restaurantId)
})

describe('STORY-NEW-B · impersonation', () => {
  it('superadmin impersonate: 200 + imp JWT with restaurant_id', async () => {
    const res = await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('superadmin'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string; expires_in: number; restaurant_name: string }
    expect(body.expires_in).toBe(1800)
    expect(body.restaurant_name).toBe('Impersonation Test')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.restaurant_id).toBe(restaurantId)
  })

  it('support impersonate: 200', async () => {
    const res = await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('support'))
    expect(res.status).toBe(200)
  })

  it('imp JWT: role=restaurant_owner, imp=true', async () => {
    const res = await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('superadmin'))
    const body = (await res.json()) as { access_token: string }
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.role).toBe('restaurant_owner')
    expect(claims?.imp).toBe(true)
  })

  it('imp JWT calling stripe patch: 403', async () => {
    const impToken = ((await (
      await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('superadmin'))
    ).json()) as { access_token: string }).access_token

    const res = await req('PATCH', '/admin/payments/stripe', impToken, {})
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('impersonation_blocked')
  })

  it('impersonation start: audit_log row created', async () => {
    await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('superadmin'))
    const audit = await admin
      .from('audit_log')
      .select('operation, new_data')
      .eq('restaurant_id', restaurantId)
      .eq('operation', 'IMPERSONATION_START')
      .limit(1)
      .maybeSingle()
    expect(audit.data?.operation).toBe('IMPERSONATION_START')
    expect((audit.data?.new_data as { target_restaurant_id: string }).target_restaurant_id).toBe(restaurantId)
  })

  it('restaurant_owner impersonating another restaurant: 403', async () => {
    const res = await req(
      'POST',
      `/superadmin/restaurants/${restaurantId}/impersonate`,
      await token('restaurant_owner', randomUUID()),
    )
    expect(res.status).toBe(403)
  })

  it('logout with imp token: 204 + IMPERSONATION_END audit', async () => {
    const impToken = ((await (
      await req('POST', `/superadmin/restaurants/${restaurantId}/impersonate`, await token('superadmin'))
    ).json()) as { access_token: string }).access_token

    const res = await req('POST', '/auth/logout', impToken)
    expect(res.status).toBe(204)
    const audit = await admin
      .from('audit_log')
      .select('operation')
      .eq('restaurant_id', restaurantId)
      .eq('operation', 'IMPERSONATION_END')
      .limit(1)
      .maybeSingle()
    expect(audit.data?.operation).toBe('IMPERSONATION_END')
  })
})
