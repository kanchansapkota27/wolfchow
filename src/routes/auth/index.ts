import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient, createAnonClient } from '../../services/supabase'
import { decodeJwtClaims, signJwt, verifyJwt } from '../../services/tokens'
import { deviceSchema, loginSchema, logoutSchema, refreshSchema, type DeviceRecord } from './schemas'

interface InviteValidationRow {
  used: boolean
  expires_at: string
  commission_rate: number
  billing_note: string | null
  plans: { name: string } | { name: string }[] | null
}

/** Tablet device sessions are long-lived (kitchen display stays signed in). */
const DEVICE_TOKEN_TTL_SECONDS = 60 * 60 * 12

/** Parse JSON body, tolerating malformed/empty bodies (caller validates with Zod). */
async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/**
 * Shared auth routes for all roles. Email/password flows delegate to Supabase
 * Auth (the custom_access_token_hook injects role/restaurant_id/permissions into
 * the JWT). Device login validates a KV-stored device token and mints a
 * Worker-signed `tablet_device` JWT.
 */
export function registerAuthRoutes(app: Hono<HonoEnv>): void {
  app.post('/auth/login', async (c) => {
    const parsed = loginSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation' }, 400)
    }

    const supabase = createAnonClient(c.env)
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error || !data.session || !data.user) {
      return c.json({ error: 'invalid_credentials' }, 401)
    }

    // The hook overwrites the base `role` claim ("authenticated") with the app
    // role only for active, provisioned users. If it is still "authenticated",
    // the account is deactivated or unprovisioned → reject.
    const claims = decodeJwtClaims(data.session.access_token)
    const role = typeof claims?.role === 'string' ? claims.role : undefined
    if (!role || role === 'authenticated') {
      return c.json({ error: 'account_inactive' }, 401)
    }

    // Fire-and-forget: audit failure must never fail the login response
    const admin = createAdminClient(c.env)
    void admin.from('audit_log').insert({
      restaurant_id: typeof claims?.restaurant_id === 'string' ? claims.restaurant_id : null,
      table_name: 'auth',
      operation: 'LOGIN',
      user_id: data.user.id,
      new_data: { email: data.user.email, role },
    })

    return c.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: { id: data.user.id, email: data.user.email, role },
    })
  })

  app.post('/auth/refresh', async (c) => {
    const parsed = refreshSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation' }, 400)
    }

    const supabase = createAnonClient(c.env)
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: parsed.data.refresh_token,
    })
    if (error || !data.session) {
      return c.json({ error: 'invalid_refresh_token' }, 401)
    }

    return c.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    })
  })

  app.post('/auth/logout', async (c) => {
    // Impersonation sessions are Worker-minted (no Supabase refresh token).
    // Ending one is client-side (discard token); the server records the audit.
    // If a valid impersonation access token is presented, log IMPERSONATION_END
    // and return — these tokens have no refresh token to revoke.
    const header = c.req.header('Authorization')
    if (header?.startsWith('Bearer ')) {
      const claims = await verifyJwt(header.slice('Bearer '.length).trim(), c.env.SUPABASE_JWT_SECRET)
      if (claims?.imp === true) {
        const admin = createAdminClient(c.env)
        await admin.from('audit_log').insert({
          restaurant_id: typeof claims.restaurant_id === 'string' ? claims.restaurant_id : null,
          table_name: 'restaurants',
          operation: 'IMPERSONATION_END',
          user_id: typeof claims.imp_by === 'string' ? claims.imp_by : null,
          new_data: { target_restaurant_id: claims.restaurant_id ?? null },
        })
        return c.body(null, 204)
      }
    }

    const parsed = logoutSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation' }, 400)
    }

    // Extract caller identity from the access token for the audit entry.
    const logoutClaims = header?.startsWith('Bearer ')
      ? await verifyJwt(header.slice('Bearer '.length).trim(), c.env.SUPABASE_JWT_SECRET)
      : null

    // Logout is idempotent: best-effort revoke, always 204.
    const supabase = createAnonClient(c.env)
    const { data } = await supabase.auth.refreshSession({
      refresh_token: parsed.data.refresh_token,
    })
    if (data.session) {
      await supabase.auth.signOut()
    }

    if (logoutClaims?.sub) {
      const admin = createAdminClient(c.env)
      void admin.from('audit_log').insert({
        restaurant_id: typeof logoutClaims.restaurant_id === 'string' ? logoutClaims.restaurant_id : null,
        table_name: 'auth',
        operation: 'LOGOUT',
        user_id: typeof logoutClaims.sub === 'string' ? logoutClaims.sub : null,
        new_data: { role: logoutClaims.role ?? null },
      })
    }

    return c.body(null, 204)
  })

  app.post('/auth/device', async (c) => {
    const parsed = deviceSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation' }, 400)
    }

    const raw = await c.env.DEVICE_TOKENS.get(`device:${parsed.data.device_token}`)
    if (!raw) {
      return c.json({ error: 'invalid_device_token' }, 401)
    }

    let record: DeviceRecord
    try {
      record = JSON.parse(raw) as DeviceRecord
    } catch {
      return c.json({ error: 'invalid_device_token' }, 401)
    }

    const now = Math.floor(Date.now() / 1000)
    const accessToken = await signJwt(
      {
        sub: record.device_id,
        role: 'tablet_device',
        restaurant_id: record.restaurant_id,
        device_id: record.device_id,
        permissions: record.permissions ?? [],
        aud: 'authenticated',
        iat: now,
        exp: now + DEVICE_TOKEN_TTL_SECONDS,
      },
      c.env.SUPABASE_JWT_SECRET,
    )

    const admin = createAdminClient(c.env)
    void admin.from('audit_log').insert({
      restaurant_id: record.restaurant_id,
      table_name: 'auth',
      operation: 'DEVICE_LOGIN',
      user_id: null,
      new_data: { device_id: record.device_id, name: record.name },
    })

    return c.json({
      access_token: accessToken,
      expires_in: DEVICE_TOKEN_TTL_SECONDS,
      user: {
        device_id: record.device_id,
        restaurant_id: record.restaurant_id,
        name: record.name,
        role: 'tablet_device',
      },
    })
  })

  // Public, no auth: the signup page validates an invite token before showing
  // the form. Order of checks: not found → 404, used/revoked → 409, expired →
  // 410. A valid token returns the plan name + billing pre-fills.
  app.get('/auth/invite/:token', async (c) => {
    const token = c.req.param('token')
    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('invites')
      .select('used, expires_at, commission_rate, billing_note, plans(name)')
      .eq('token', token)
      .maybeSingle()

    if (!data) return c.json({ error: 'invite_not_found' }, 404)
    const invite = data as InviteValidationRow
    if (invite.used) return c.json({ error: 'invite_used' }, 409)
    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return c.json({ error: 'invite_expired' }, 410)
    }

    const planName = Array.isArray(invite.plans) ? invite.plans[0]?.name : invite.plans?.name
    return c.json({
      plan_name: planName ?? null,
      commission_rate: invite.commission_rate,
      billing_note: invite.billing_note,
    })
  })
}
