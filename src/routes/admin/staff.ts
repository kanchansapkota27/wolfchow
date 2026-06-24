import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { KvCache } from '../../services/kv'
import { resolvePlan } from '../../services/plan'
import { requireRole } from '../../middleware/guards'

// ── Constants ──────────────────────────────────────────────────────────────────

const VALID_PERMISSIONS = new Set([
  'orders:accept_reject',
  'orders:status',
  'inventory:write',
  'orders:pause',
])

const DEVICE_TOKEN_TTL = 90 * 24 * 60 * 60  // 90 days in seconds

// ── Schemas ────────────────────────────────────────────────────────────────────

const permissionsSchema = z
  .array(z.string())
  .superRefine((perms, ctx) => {
    for (const p of perms) {
      if (!VALID_PERMISSIONS.has(p)) {
        ctx.addIssue({ code: 'custom', message: `Unknown permission: ${p}`, path: [] })
      }
    }
  })

const inviteStaffSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  permissions: permissionsSchema,
})

const patchStaffSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional(),
  permissions: permissionsSchema.optional(),
})

const createDeviceSchema = z.object({
  name: z.string().min(1).max(100),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

/** Generate a device token: `dt_` + 64 hex chars. */
function generateDeviceToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return 'dt_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Primary KV key for tablet auth lookup: by token. */
function deviceTokenKey(token: string): string {
  return `device:${token}`
}

/** Secondary KV index for O(1) revoke: by (restaurantId, deviceId) → token. */
function deviceIndexKey(restaurantId: string, deviceId: string): string {
  return `device_index:${restaurantId}:${deviceId}`
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerStaffRoutes(app: Hono<HonoEnv>): void {
  // All write routes are owner-only — kitchen tablets must not manage staff.
  app.use('/admin/staff/invite', requireRole('restaurant_owner'))
  app.use('/admin/staff/device', requireRole('restaurant_owner'))
  app.use('/admin/staff/:id', requireRole('restaurant_owner'))
  app.use('/admin/staff/device/:id', requireRole('restaurant_owner'))

  // ── GET /admin/staff ───────────────────────────────────────────────────────

  app.get('/admin/staff', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('users')
      .select('id, name, email, phone, permissions, active, device_id, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen')
      .order('created_at', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ staff: data ?? [] })
  })

  // ── POST /admin/staff/invite ───────────────────────────────────────────────

  app.post('/admin/staff/invite', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = inviteStaffSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Check staff_cap from plan
    const plan = await resolvePlan(c.env, restaurantId)
    const staffCap = typeof plan?.staff_cap === 'number' ? plan.staff_cap : null

    if (staffCap !== null) {
      const { count } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'kitchen')
        .eq('active', true)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count >= staffCap) {
        return c.json({ error: 'plan_limit_reached', limit: staffCap, current: count }, 402)
      }
    }

    // Send Supabase auth invite — captures the auth user's id so the profile
    // row can be linked to auth.users (even though the FK is now gone, we keep
    // the ids in sync for future RLS policies).
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email)
    if (inviteError || !inviteData?.user) {
      return c.json({ error: 'invite_failed' }, 500)
    }

    // Insert staff profile row
    const { data, error } = await admin
      .from('users')
      .insert({
        id: inviteData.user.id,
        role: 'kitchen',
        restaurant_id: restaurantId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        permissions: parsed.data.permissions,
        active: true,
      })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    return c.json(data, 201)
  })

  // ── PATCH /admin/staff/:id ─────────────────────────────────────────────────

  app.patch('/admin/staff/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const parsed = patchStaffSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('users')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen')
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    return c.json(data)
  })

  // ── DELETE /admin/staff/:id ────────────────────────────────────────────────

  app.delete('/admin/staff/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('users')
      .update({ active: false })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen')
      .select('id, active')
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    return c.body(null, 204)
  })

  // ── POST /admin/staff/device ───────────────────────────────────────────────

  app.post('/admin/staff/device', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = createDeviceSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Check staff_cap from plan (devices count against the same cap)
    const plan = await resolvePlan(c.env, restaurantId)
    const staffCap = typeof plan?.staff_cap === 'number' ? plan.staff_cap : null

    if (staffCap !== null) {
      const { count } = await admin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('role', 'kitchen')
        .eq('active', true)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count >= staffCap) {
        return c.json({ error: 'plan_limit_reached', limit: staffCap, current: count }, 402)
      }
    }

    const defaultPermissions = ['orders:accept_reject', 'orders:status', 'inventory:write']
    const deviceId = crypto.randomUUID()
    const deviceToken = generateDeviceToken()

    const { data, error } = await admin
      .from('users')
      .insert({
        role: 'kitchen',
        restaurant_id: restaurantId,
        name: parsed.data.name,
        device_id: deviceId,
        permissions: defaultPermissions,
        active: true,
      })
      .select('id, name, device_id, permissions, active')
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    const tokenPayload = JSON.stringify({ restaurant_id: restaurantId, device_id: deviceId, name: parsed.data.name, permissions: defaultPermissions })
    await Promise.all([
      // Primary key: fast tablet auth lookup by token
      c.env.DEVICE_TOKENS.put(deviceTokenKey(deviceToken), tokenPayload, { expirationTtl: DEVICE_TOKEN_TTL }),
      // Secondary index: O(1) revoke by (restaurantId, deviceId)
      c.env.DEVICE_TOKENS.put(deviceIndexKey(restaurantId, deviceId), deviceToken, { expirationTtl: DEVICE_TOKEN_TTL }),
    ])

    return c.json({ device_token: deviceToken, staff: data }, 201)
  })

  // ── DELETE /admin/staff/device/:id ────────────────────────────────────────

  app.delete('/admin/staff/device/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)

    // Look up by primary key — the frontend passes device.id (users.id),
    // then use the device_id from the row to revoke the KV token.
    const { data: user } = await admin
      .from('users')
      .select('id, device_id')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen')
      .single()

    if (!user || !(user as { device_id: string | null }).device_id) {
      return c.json({ error: 'not_found' }, 404)
    }

    const deviceId = (user as { device_id: string }).device_id

    // O(1) revoke via secondary index: restaurantId-scoped, no cross-tenant scan
    const indexKey = deviceIndexKey(restaurantId, deviceId)
    const token = await c.env.DEVICE_TOKENS.get(indexKey)
    if (token) {
      await Promise.all([
        c.env.DEVICE_TOKENS.delete(deviceTokenKey(token)),
        c.env.DEVICE_TOKENS.delete(indexKey),
      ])
    }

    // Soft-deactivate the users row
    await admin
      .from('users')
      .update({ active: false })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)

    return c.body(null, 204)
  })
}
