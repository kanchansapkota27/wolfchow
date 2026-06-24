import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { createInviteSchema } from './schemas'

/** Invites live 72h from creation. */
const INVITE_TTL_MS = 72 * 60 * 60 * 1000

/**
 * Base URL of the admin signup page; the invite token is appended as a query
 * param. Configurable via `SIGNUP_BASE_URL` so the (independently-deployed)
 * admin app's origin can differ per environment.
 */
const DEFAULT_SIGNUP_BASE_URL = 'https://admin.restroapi.com/signup'

interface InviteRow {
  id: string
  token: string
  plan_id: string
  commission_rate: number
  billing_note: string | null
  email: string | null
  restaurant_name: string | null
  used: boolean
  used_at: string | null
  used_by_restaurant_id: string | null
  expires_at: string
  created_at: string
}

/** Derived lifecycle status shown in the superadmin invite list. */
export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked'

/** Generate `inv_` + 64 hex chars (32 random bytes) using Web Crypto. */
function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return `inv_${hex}`
}

/**
 * Derive an invite's status. `used=true` with a restaurant → legitimately used;
 * `used=true` with no restaurant → manually revoked. Otherwise pending unless
 * past expiry.
 */
export function deriveStatus(invite: InviteRow, now = Date.now()): InviteStatus {
  if (invite.used) {
    return invite.used_by_restaurant_id ? 'used' : 'revoked'
  }
  if (new Date(invite.expires_at).getTime() <= now) return 'expired'
  return 'pending'
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/**
 * Superadmin invite management. Mounted under the `/superadmin/*` guard stack
 * (JWT → platform role → MFA). Uses the service-role admin client.
 */
export function registerInviteRoutes(app: Hono<HonoEnv>): void {
  app.post('/superadmin/invites', async (c) => {
    const parsed = createInviteSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Plan must exist and be live.
    const plan = await admin
      .from('plans')
      .select('id')
      .eq('id', parsed.data.plan_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!plan.data) return c.json({ error: 'plan_not_found' }, 404)

    const token = generateInviteToken()
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()
    const { data, error } = await admin
      .from('invites')
      .insert({
        token,
        plan_id: parsed.data.plan_id,
        commission_rate: parsed.data.commission_rate ?? 0,
        billing_note: parsed.data.billing_note ?? null,
        email: parsed.data.email ?? null,
        restaurant_name: parsed.data.restaurant_name ?? null,
        used: false,
        expires_at: expiresAt,
      })
      .select('id, token, expires_at')
      .single()
    if (error || !data) return c.json({ error: 'insert_failed' }, 500)

    const row = data as { id: string; token: string; expires_at: string }
    const signupBase = c.env.SIGNUP_BASE_URL ?? DEFAULT_SIGNUP_BASE_URL
    return c.json(
      {
        id: row.id,
        token: row.token,
        invite_url: `${signupBase}?invite=${row.token}`,
        expires_at: row.expires_at,
      },
      201,
    )
  })

  app.get('/superadmin/invites', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return c.json({ error: 'query_failed' }, 500)

    const now = Date.now()
    const invites = (data as InviteRow[]).map((inv) => ({
      id: inv.id,
      token: inv.token,
      plan_id: inv.plan_id,
      commission_rate: inv.commission_rate,
      billing_note: inv.billing_note,
      email: inv.email,
      restaurant_name: inv.restaurant_name,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
      used_at: inv.used_at,
      status: deriveStatus(inv, now),
    }))
    return c.json({ invites })
  })

  // Revoke: soft-mark as used (no restaurant = revoked, not claimed). Only
  // operates on unused (pending) invites; used/expired invites are immutable.
  app.post('/superadmin/invites/:id/revoke', async (c) => {
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('invites')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', id)
      .eq('used', false)
      .select('id')
      .maybeSingle()
    if (error) return c.json({ error: 'revoke_failed' }, 500)
    if (!data) return c.json({ error: 'invite_not_found' }, 404)
    return c.body(null, 204)
  })

  // Hard-delete: permanently removes the invite row regardless of status.
  // Used for cleanup — the UI shows this for all invite states.
  app.delete('/superadmin/invites/:id', async (c) => {
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)
    const { error } = await admin.from('invites').delete().eq('id', id)
    if (error) return c.json({ error: 'delete_failed' }, 500)
    return c.body(null, 204)
  })
}
