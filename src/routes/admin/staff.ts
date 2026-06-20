import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

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

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerStaffRoutes(app: Hono<HonoEnv>): void {
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
    const cache = new KvCache(c.env.SETTINGS_CACHE)

    // Check staff_cap from plan KV
    const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
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

    // Send Supabase auth invite
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email)
    if (inviteError) {
      return c.json({ error: 'invite_failed', message: inviteError.message }, 500)
    }

    // Insert staff profile row
    const { data, error } = await admin
      .from('users')
      .insert({
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

    const defaultPermissions = ['orders:accept_reject', 'orders:status', 'inventory:write']
    const deviceId = crypto.randomUUID()
    const deviceToken = generateDeviceToken()

    const admin = createAdminClient(c.env)

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

    // Write token to DEVICE_TOKENS KV — key shown only here
    await c.env.DEVICE_TOKENS.put(
      `device:${deviceToken}`,
      JSON.stringify({ restaurant_id: restaurantId, device_id: deviceId, name: parsed.data.name, permissions: defaultPermissions }),
      { expirationTtl: DEVICE_TOKEN_TTL },
    )

    return c.json({ device_token: deviceToken, staff: data }, 201)
  })

  // ── DELETE /admin/staff/device/:id ────────────────────────────────────────

  app.delete('/admin/staff/device/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const deviceId = c.req.param('id')

    const admin = createAdminClient(c.env)

    // Fetch the users row to get the device_token KV key (via device_id)
    const { data: user } = await admin
      .from('users')
      .select('id, device_id')
      .eq('device_id', deviceId)
      .eq('restaurant_id', restaurantId)
      .eq('role', 'kitchen')
      .single()

    if (!user) return c.json({ error: 'not_found' }, 404)

    // Scan KV for the token matching this device_id and delete it
    // Since we store by token (not device_id), we need to list and find the match.
    // The spec says DELETE /admin/staff/device/:id where :id is the device_id.
    // We do a KV list to find and delete the matching token entry.
    const listed = await c.env.DEVICE_TOKENS.list({ prefix: 'device:' })
    for (const key of listed.keys) {
      const val = await c.env.DEVICE_TOKENS.get(key.name, 'json') as { device_id?: string } | null
      if (val?.device_id === deviceId) {
        await c.env.DEVICE_TOKENS.delete(key.name)
        break
      }
    }

    // Soft-deactivate the users row
    await admin
      .from('users')
      .update({ active: false })
      .eq('device_id', deviceId)
      .eq('restaurant_id', restaurantId)

    return c.body(null, 204)
  })
}
