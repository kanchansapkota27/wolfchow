import type { Context, Hono } from 'hono'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HonoEnv } from '../../types'
import { createAdminClient, createAnonClient } from '../../services/supabase'
import { decodeJwtClaims, signJwt, verifyJwt } from '../../services/tokens'
import { buildKey, KvCache, KV_TTLS } from '../../services/kv'
import { deviceSchema, loginSchema, logoutSchema, refreshSchema, signupSchema, type DeviceRecord } from './schemas'

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return s || 'restaurant'
}

async function resolveSlug(admin: SupabaseClient, base: string): Promise<string> {
  let slug = base
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data } = await admin.from('restaurants').select('id').eq('slug', slug).maybeSingle()
    if (!data) return slug
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  return slug
}

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
      ip_address: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? null,
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
    if (header?.startsWith('Bearer ') && c.env.SUPABASE_JWT_SECRET) {
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
    const logoutClaims = header?.startsWith('Bearer ') && c.env.SUPABASE_JWT_SECRET
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
        ip_address: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? null,
      })
    }

    return c.body(null, 204)
  })

  app.post('/auth/device', async (c) => {
    // Device tokens are always HS256, minted by this Worker — unlike regular
    // user sessions, which may be ES256 tokens issued by Supabase itself.
    if (!c.env.SUPABASE_JWT_SECRET) {
      return c.json({ error: 'device_auth_not_configured' }, 500)
    }

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

    // Both writes below must go through waitUntil (not `void ...`): a
    // Supabase query builder is a lazy thenable that only issues its HTTP
    // request when awaited/`.then()`'d — `void`ing the expression discards
    // it before that ever happens, so neither write would ever actually fire.
    const admin = createAdminClient(c.env)
    c.executionCtx.waitUntil(
      Promise.resolve(
        admin.from('audit_log').insert({
          restaurant_id: record.restaurant_id,
          table_name: 'auth',
          operation: 'DEVICE_LOGIN',
          user_id: null,
          new_data: { device_id: record.device_id, name: record.name },
        }),
      ).catch(() => {}),
    )

    // Update device last_seen_at and capture platform/uuid on first login
    const deviceUpdate: Record<string, unknown> = { last_seen_at: new Date().toISOString() }
    if (parsed.data.device_uuid) deviceUpdate.device_uuid = parsed.data.device_uuid
    if (parsed.data.platform) deviceUpdate.platform = parsed.data.platform
    c.executionCtx.waitUntil(
      Promise.resolve(
        admin
          .from('devices')
          .update(deviceUpdate)
          .eq('id', record.device_id)
          .eq('restaurant_id', record.restaurant_id)
          .is('revoked_at', null),
      ).catch(() => {}),
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

  // ── /auth/signup ─────────────────────────────────────────────────────────

  app.post('/auth/signup', async (c) => {
    const parsed = signupSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const body = parsed.data
    const currency = body.currency.toUpperCase()

    // Validate timezone — Intl.DateTimeFormat throws RangeError for unknown zones
    try {
      Intl.DateTimeFormat(undefined, { timeZone: body.timezone })
    } catch {
      return c.json({ error: 'invalid_timezone', timezone: body.timezone }, 422)
    }

    const admin = createAdminClient(c.env)

    // Load and validate invite (join plans so we have plan data for KV)
    const { data: inviteRow } = await admin
      .from('invites')
      .select('id, used, expires_at, plan_id, plans(id, name, device_cap, item_cap, category_cap, modifier_cap, smtp_monthly_limit, transaction_history_days, feature_flags, payment_methods_allowed, commission_type, commission_value)')
      .eq('token', body.invite_token)
      .maybeSingle()

    if (!inviteRow) return c.json({ error: 'invalid_invite' }, 400)
    if (inviteRow.used) return c.json({ error: 'invite_used' }, 409)
    if (new Date(inviteRow.expires_at).getTime() <= Date.now()) {
      return c.json({ error: 'invite_expired' }, 410)
    }

    const plan = Array.isArray(inviteRow.plans) ? inviteRow.plans[0] : inviteRow.plans

    // Resolve slug
    const baseSlug = body.slug ?? slugify(body.business_name)
    const slug = await resolveSlug(admin, baseSlug)

    // Create Supabase Auth user
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: body.admin_email,
      password: body.password,
      email_confirm: true,
    })
    if (authError || !authData.user) {
      if (authError?.message?.includes('already been registered')) {
        return c.json({ error: 'email_taken' }, 409)
      }
      return c.json({ error: 'signup_failed' }, 500)
    }

    const userId = authData.user.id

    try {
      // Insert restaurant
      const { data: restaurant, error: restError } = await admin
        .from('restaurants')
        .insert({
          slug,
          business_name: body.business_name,
          display_name: body.display_name ?? body.business_name,
          timezone: body.timezone,
          currency,
          address: body.address,
          plan_id: inviteRow.plan_id ?? null,
        })
        .select('id')
        .single()

      if (restError || !restaurant) {
        throw new Error('restaurant_insert_failed')
      }

      const restaurantId = restaurant.id as string

      // Insert users row (links auth user → restaurant)
      const { error: userError } = await admin.from('users').insert({
        id: userId,
        restaurant_id: restaurantId,
        role: 'restaurant_owner',
        name: body.admin_name,
        phone: body.admin_phone ?? null,
        email: body.admin_email,
      })
      if (userError) throw new Error('user_insert_failed')

      // Mark invite used
      await admin
        .from('invites')
        .update({ used: true, used_at: new Date().toISOString(), used_by_restaurant_id: restaurantId })
        .eq('id', inviteRow.id)

      // Write KV entries
      const cache = new KvCache(c.env.SETTINGS_CACHE)
      await Promise.all([
        // slug:{slug} → restaurant_id (permanent, no TTL)
        cache.set(buildKey('slug', slug), restaurantId, KV_TTLS['slug'] ?? 0),
        // plan:{restaurant_id} → plan flags (1h TTL)
        plan
          ? cache.set(buildKey('plan', restaurantId), plan, KV_TTLS['plan'] ?? 3600)
          : Promise.resolve(),
      ])

      // Sign in the new user to get session tokens
      const anon = createAnonClient(c.env)
      const { data: session, error: sessionError } = await anon.auth.signInWithPassword({
        email: body.admin_email,
        password: body.password,
      })
      if (sessionError || !session.session) {
        // Account is created; sign-in failure is non-fatal — client can call /auth/login
        return c.json({ error: 'signin_after_signup_failed' }, 500)
      }

      return c.json(
        {
          access_token: session.session.access_token,
          refresh_token: session.session.refresh_token,
          expires_in: session.session.expires_in,
          user: { id: userId, email: body.admin_email, role: 'restaurant_owner' },
          restaurant: { id: restaurantId, slug, display_name: body.display_name ?? body.business_name },
        },
        201,
      )
    } catch {
      // Clean up orphaned auth user on any provisioning failure
      void admin.auth.admin.deleteUser(userId)
      return c.json({ error: 'signup_failed' }, 500)
    }
  })

  // ── /auth/invite/:token ───────────────────────────────────────────────────

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
