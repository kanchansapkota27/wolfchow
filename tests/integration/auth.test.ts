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
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

const admin: SupabaseClient = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Fake CF KV holding device records (the Worker reads `device:{token}`).
const deviceStore = new Map<string, string>()
const env = {
  SUPABASE_URL: API_URL,
  SUPABASE_ANON_KEY: ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: JWT_SECRET,
  DEVICE_TOKENS: { get: async (key: string) => deviceStore.get(key) ?? null },
} as unknown as Env

const app = new Hono<HonoEnv>()
registerAuthRoutes(app)

const PASSWORD = 'Password123!'
const createdUserIds: string[] = []
let restaurantId = ''

async function createUser(opts: {
  role: string
  restaurantId: string | null
  permissions?: string[]
  active?: boolean
}): Promise<{ id: string; email: string }> {
  const email = `${opts.role}-${randomUUID().slice(0, 8)}@test.local`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('createUser failed')
  const id = data.user.id
  createdUserIds.push(id)
  const { error: insertError } = await admin.from('users').insert({
    id,
    email,
    name: opts.role,
    role: opts.role,
    restaurant_id: opts.restaurantId,
    permissions: opts.permissions ?? [],
    active: opts.active ?? true,
  })
  if (insertError) throw insertError
  return { id, email }
}

// waitUntil() requires a real ExecutionContext — app.request() has none by
// default. Collect the promises so tests can await background writes
// (e.g. devices.last_seen_at) deterministically instead of racing them.
const waitUntilPromises: Promise<unknown>[] = []
const fakeExecutionCtx = {
  waitUntil: (p: Promise<unknown>) => { waitUntilPromises.push(p) },
  passThroughOnException: () => {},
} as unknown as ExecutionContext

async function flushWaitUntil(): Promise<void> {
  await Promise.all(waitUntilPromises.splice(0))
}

function post(path: string, body: unknown): Promise<Response> {
  return app.request(
    path,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    env,
    fakeExecutionCtx,
  )
}

async function login(email: string): Promise<Response> {
  return post('/auth/login', { email, password: PASSWORD })
}

beforeAll(async () => {
  const { data, error } = await admin
    .from('restaurants')
    .insert({
      slug: `auth-${randomUUID().slice(0, 8)}`,
      display_name: 'Auth Test',
      business_name: 'Auth Test LLC',
      timezone: 'Europe/Istanbul',
    })
    .select('id')
    .single()
  if (error) throw error
  restaurantId = data.id as string
})

afterAll(async () => {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id)
  }
  if (restaurantId) await admin.from('restaurants').delete().eq('id', restaurantId)
})

describe('STORY-NEW-A · auth shared backend', () => {
  it('valid superadmin login: JWT contains role=superadmin, restaurant_id=null', async () => {
    const { email } = await createUser({ role: 'superadmin', restaurantId: null })
    const res = await login(email)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { role: string }; access_token: string }
    expect(body.user.role).toBe('superadmin')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.role).toBe('superadmin')
    expect(claims?.restaurant_id).toBeNull()
  })

  it('valid restaurant_owner login: JWT contains restaurant_id, role=restaurant_owner', async () => {
    const { email } = await createUser({ role: 'restaurant_owner', restaurantId })
    const res = await login(email)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { user: { role: string }; access_token: string }
    expect(body.user.role).toBe('restaurant_owner')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.restaurant_id).toBe(restaurantId)
  })

  it('kitchen login: permissions array from users table', async () => {
    const { email } = await createUser({
      role: 'kitchen',
      restaurantId,
      permissions: ['orders:accept', 'orders:reject'],
    })
    const res = await login(email)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string }
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.permissions).toEqual(['orders:accept', 'orders:reject'])
  })

  it('deactivated user login: 401', async () => {
    const { email } = await createUser({ role: 'kitchen', restaurantId, active: false })
    const res = await login(email)
    expect(res.status).toBe(401)
    expect((await res.json() as { error: string }).error).toBe('account_inactive')
  })

  it('device token valid: 200 + tablet_device JWT', async () => {
    deviceStore.set(
      'device:tok-valid',
      JSON.stringify({
        restaurant_id: restaurantId,
        device_id: 'kds-1',
        name: 'Kitchen Display 1',
        permissions: ['orders:view'],
      }),
    )
    const res = await post('/auth/device', { device_token: 'tok-valid' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string; user: { role: string } }
    expect(body.user.role).toBe('tablet_device')
    const claims = decodeJwtClaims(body.access_token)
    expect(claims?.role).toBe('tablet_device')
    expect(claims?.restaurant_id).toBe(restaurantId)
    expect(claims?.device_id).toBe('kds-1')
    await flushWaitUntil()
  })

  it('device token valid: last_seen_at is actually written to the devices row (not just built and discarded)', async () => {
    const { data: device, error } = await admin
      .from('devices')
      .insert({ restaurant_id: restaurantId, name: 'Kitchen Display 2', permissions: ['orders:view'] })
      .select('id')
      .single()
    if (error) throw error

    deviceStore.set(
      'device:tok-valid-2',
      JSON.stringify({
        restaurant_id: restaurantId,
        device_id: device.id,
        name: 'Kitchen Display 2',
        permissions: ['orders:view'],
      }),
    )
    const pwaUuid = randomUUID()
    const res = await post('/auth/device', { device_token: 'tok-valid-2', device_uuid: pwaUuid, platform: 'iPad · Safari' })
    expect(res.status).toBe(200)
    await flushWaitUntil()

    const { data: row } = await admin
      .from('devices')
      .select('last_seen_at, device_uuid, platform')
      .eq('id', device.id as string)
      .single()
    expect(row?.last_seen_at).not.toBeNull()
    expect(row?.device_uuid).toBe(pwaUuid)
    expect(row?.platform).toBe('iPad · Safari')
  })

  it('device token invalid: 401', async () => {
    const res = await post('/auth/device', { device_token: 'does-not-exist' })
    expect(res.status).toBe(401)
    expect((await res.json() as { error: string }).error).toBe('invalid_device_token')
  })

  it('POST /auth/refresh: new access_token returned', async () => {
    const { email } = await createUser({ role: 'superadmin', restaurantId: null })
    const loginBody = (await (await login(email)).json()) as { refresh_token: string }
    const res = await post('/auth/refresh', { refresh_token: loginBody.refresh_token })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { access_token: string }
    expect(typeof body.access_token).toBe('string')
    expect(body.access_token.length).toBeGreaterThan(0)
  })

  it('POST /auth/logout: 204', async () => {
    const { email } = await createUser({ role: 'superadmin', restaurantId: null })
    const loginBody = (await (await login(email)).json()) as { refresh_token: string }
    const res = await post('/auth/logout', { refresh_token: loginBody.refresh_token })
    expect(res.status).toBe(204)
  })
})
