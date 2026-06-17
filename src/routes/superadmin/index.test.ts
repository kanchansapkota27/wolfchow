import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { signJwt } from '../../services/tokens'
import { registerSuperadminRoutes } from './index'

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'

const app = new Hono<HonoEnv>()
registerSuperadminRoutes(app)

const env = { SUPABASE_JWT_SECRET: JWT_SECRET } as unknown as Env
const envBypass = { SUPABASE_JWT_SECRET: JWT_SECRET, MFA_DEV_BYPASS: 'true' } as unknown as Env

interface TokenOpts {
  role: string
  restaurant_id?: string | null
  totp?: boolean
}

/** Mint a Supabase-shaped HS256 token the real jwtMiddleware will accept. */
async function token(opts: TokenOpts): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const amr = [{ method: 'password', timestamp: now }]
  if (opts.totp) amr.push({ method: 'totp', timestamp: now })
  return signJwt(
    {
      sub: 'user-1',
      role: opts.role,
      restaurant_id: opts.restaurant_id ?? null,
      permissions: [],
      amr,
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

async function getSession(bearer?: string, withEnv: Env = env): Promise<Response> {
  const headers: Record<string, string> = {}
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  return await app.request('/superadmin/session', { headers }, withEnv)
}

describe('STORY-005 · superadmin auth & MFA guard', () => {
  it('superadmin with TOTP in amr: passes (200)', async () => {
    const res = await getSession(await token({ role: 'superadmin', totp: true }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { role: string; restaurant_id: string | null; mfa: boolean }
    expect(body.role).toBe('superadmin')
    expect(body.restaurant_id).toBeNull()
    expect(body.mfa).toBe(true)
  })

  it('support with TOTP in amr: passes (200)', async () => {
    const res = await getSession(await token({ role: 'support', totp: true }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { role: string }).role).toBe('support')
  })

  it('superadmin without MFA in amr: 403 mfa_required', async () => {
    const res = await getSession(await token({ role: 'superadmin', totp: false }))
    expect(res.status).toBe(403)
    expect(((await res.json()) as { error: string }).error).toBe('mfa_required')
  })

  it('tenant role (restaurant_owner) on /superadmin/*: 403 forbidden', async () => {
    const res = await getSession(await token({ role: 'restaurant_owner', restaurant_id: 'r1', totp: true }))
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('insufficient_role')
  })

  it('no Authorization header: 401 unauthorized', async () => {
    const res = await getSession()
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized')
  })

  it('MFA_DEV_BYPASS=true: superadmin without TOTP passes (local dev)', async () => {
    const res = await getSession(await token({ role: 'superadmin', totp: false }), envBypass)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { role: string }).role).toBe('superadmin')
  })

  it('MFA_DEV_BYPASS does not widen role access: tenant role still 403', async () => {
    const res = await getSession(
      await token({ role: 'restaurant_owner', restaurant_id: 'r1', totp: false }),
      envBypass,
    )
    expect(res.status).toBe(403)
    expect(((await res.json()) as { code: string }).code).toBe('insufficient_role')
  })
})
