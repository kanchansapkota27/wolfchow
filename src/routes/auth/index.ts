import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAnonClient } from '../../services/supabase'
import { decodeJwtClaims, signJwt } from '../../services/tokens'
import { deviceSchema, loginSchema, logoutSchema, refreshSchema, type DeviceRecord } from './schemas'

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
    const parsed = logoutSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation' }, 400)
    }

    // Logout is idempotent: best-effort revoke, always 204.
    const supabase = createAnonClient(c.env)
    const { data } = await supabase.auth.refreshSession({
      refresh_token: parsed.data.refresh_token,
    })
    if (data.session) {
      await supabase.auth.signOut()
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
}
