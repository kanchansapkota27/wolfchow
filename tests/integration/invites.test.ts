import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerSuperadminRoutes } from '../../src/routes/superadmin'
import { registerAuthRoutes } from '../../src/routes/auth'
import { deriveStatus } from '../../src/routes/superadmin/invites'
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

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
} as unknown as Env

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)
registerAuthRoutes(app)

async function token(role: string, restaurantId: string | null = null): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'admin-1',
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

function req(method: string, path: string, bearer?: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {}
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  return app.request(path, init, env)
}

let SUPERADMIN = ''
let planId = ''
const createdInviteIds: string[] = []

beforeAll(async () => {
  SUPERADMIN = await token('superadmin')
  const plan = await admin.from('plans').select('id').eq('name', 'Starter').single()
  if (plan.error) throw plan.error
  planId = plan.data.id as string
})

afterAll(async () => {
  for (const id of createdInviteIds) await admin.from('invites').delete().eq('id', id)
})

/** Insert an invite row directly (for expired/used fixtures). */
async function insertInvite(fields: Record<string, unknown>): Promise<{ id: string; token: string }> {
  const tok = `inv_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 68)
  const { data, error } = await admin
    .from('invites')
    .insert({
      token: tok,
      plan_id: planId,
      commission_rate: 0,
      expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      used: false,
      ...fields,
    })
    .select('id, token')
    .single()
  if (error || !data) throw error ?? new Error('insertInvite failed')
  createdInviteIds.push(data.id as string)
  return { id: data.id as string, token: data.token as string }
}

describe('STORY-007 · invite link generation', () => {
  it('generate invite: token starts with inv_, stored in DB, URL returned', async () => {
    const res = await req('POST', '/superadmin/invites', SUPERADMIN, { plan_id: planId, billing_note: 'VIP' })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; token: string; invite_url: string; expires_at: string }
    createdInviteIds.push(body.id)
    expect(body.token.startsWith('inv_')).toBe(true)
    expect(body.invite_url).toBe(`https://admin.restroapi.com/signup?invite=${body.token}`)

    const row = await admin.from('invites').select('plan_id, used, billing_note').eq('id', body.id).single()
    expect(row.data?.used).toBe(false)
    expect(row.data?.billing_note).toBe('VIP')
  })

  it('GET /auth/invite/:token valid: 200 + plan name', async () => {
    const { token: tok } = await insertInvite({ commission_rate: 0.02, billing_note: 'note' })
    const res = await req('GET', `/auth/invite/${tok}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { plan_name: string; commission_rate: number; billing_note: string }
    expect(body.plan_name).toBe('Starter')
    expect(body.commission_rate).toBe(0.02)
    expect(body.billing_note).toBe('note')
  })

  it('GET /auth/invite expired token: 410', async () => {
    const { token: tok } = await insertInvite({ expires_at: new Date(Date.now() - 1000).toISOString() })
    const res = await req('GET', `/auth/invite/${tok}`)
    expect(res.status).toBe(410)
    expect(((await res.json()) as { error: string }).error).toBe('invite_expired')
  })

  it('GET /auth/invite used token: 409', async () => {
    const { token: tok } = await insertInvite({
      used: true,
      used_at: new Date().toISOString(),
      used_by_restaurant_id: null,
    })
    const res = await req('GET', `/auth/invite/${tok}`)
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: string }).error).toBe('invite_used')
  })

  it('DELETE invite: subsequent validate returns 409', async () => {
    const created = (await (
      await req('POST', '/superadmin/invites', SUPERADMIN, { plan_id: planId })
    ).json()) as { id: string; token: string }
    createdInviteIds.push(created.id)

    const del = await req('DELETE', `/superadmin/invites/${created.id}`, SUPERADMIN)
    expect(del.status).toBe(204)

    const res = await req('GET', `/auth/invite/${created.token}`)
    expect(res.status).toBe(409)

    // Revoked invite is distinguishable in the list (used, no restaurant).
    const list = (await (await req('GET', '/superadmin/invites', SUPERADMIN)).json()) as {
      invites: Array<{ id: string; status: string }>
    }
    expect(list.invites.find((i) => i.id === created.id)?.status).toBe('revoked')
  })

  it('non-superadmin generating invite: 403', async () => {
    const ownerToken = await token('restaurant_owner', randomUUID())
    const res = await req('POST', '/superadmin/invites', ownerToken, { plan_id: planId })
    expect(res.status).toBe(403)
  })

  it('deriveStatus: pending / used / expired / revoked', () => {
    const base = {
      id: 'i',
      token: 't',
      plan_id: 'p',
      commission_rate: 0,
      billing_note: null,
      email: null,
      used_at: null,
      used_by_restaurant_id: null,
      created_at: '2026-06-16T00:00:00Z',
    }
    const future = new Date(Date.now() + 1000).toISOString()
    const past = new Date(Date.now() - 1000).toISOString()
    expect(deriveStatus({ ...base, used: false, expires_at: future })).toBe('pending')
    expect(deriveStatus({ ...base, used: false, expires_at: past })).toBe('expired')
    expect(deriveStatus({ ...base, used: true, used_by_restaurant_id: 'r1', expires_at: future })).toBe('used')
    expect(deriveStatus({ ...base, used: true, used_by_restaurant_id: null, expires_at: future })).toBe('revoked')
  })
})
