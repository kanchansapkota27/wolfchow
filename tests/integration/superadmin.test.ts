import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../src/types'
import { registerAuthRoutes } from '../../src/routes/auth'
import { decodeJwtClaims } from '../../src/services/tokens'

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

const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
} as unknown as Env

const app = new Hono<HonoEnv>()
registerAuthRoutes(app)

const PASSWORD = 'Password123!'
const createdUserIds: string[] = []

/** Provision a platform user the same way scripts/seed-superadmin.ts does. */
async function provision(role: 'superadmin' | 'support'): Promise<string> {
  const email = `${role}-${randomUUID().slice(0, 8)}@test.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  createdUserIds.push(data.user.id)
  const { error: insertError } = await admin.from('users').insert({
    id: data.user.id,
    email,
    name: role,
    role,
    restaurant_id: null,
    permissions: [],
    active: true,
  })
  if (insertError) throw insertError
  return email
}

function login(email: string): Promise<Response> {
  return app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    },
    env,
  )
}

let superadminEmail = ''
let supportEmail = ''

beforeAll(async () => {
  superadminEmail = await provision('superadmin')
  supportEmail = await provision('support')
})

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id)
  }
})

describe('STORY-005 · superadmin & support provisioning', () => {
  it('superadmin JWT: role=superadmin, restaurant_id=null', async () => {
    const res = await login(superadminEmail)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { role: string }; access_token: string }
    expect(body.user.role).toBe('superadmin')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.role).toBe('superadmin')
    expect(claims?.restaurant_id).toBeNull()
  })

  it('support JWT: role=support, restaurant_id=null', async () => {
    const res = await login(supportEmail)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { role: string }; access_token: string }
    expect(body.user.role).toBe('support')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.role).toBe('support')
    expect(claims?.restaurant_id).toBeNull()
  })
})
