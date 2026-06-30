import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'

const VALID_PERMISSIONS = new Set([
  'orders:accept_reject',
  'orders:status',
  'inventory:write',
  'orders:pause',
])

const DEVICE_TOKEN_TTL = 90 * 24 * 60 * 60

const permissionsSchema = z.array(z.string()).superRefine((perms, ctx) => {
  for (const p of perms) {
    if (!VALID_PERMISSIONS.has(p)) {
      ctx.addIssue({ code: 'custom', message: `Unknown permission: ${p}`, path: [] })
    }
  }
})

const createDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  permissions: permissionsSchema.default(['orders:accept_reject', 'orders:status']),
})

const patchDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  permissions: permissionsSchema.optional(),
})

function generateDeviceToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return 'dt_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function deviceTokenKey(token: string): string {
  return `device:${token}`
}

function deviceIndexKey(restaurantId: string, deviceId: string): string {
  return `device_index:${restaurantId}:${deviceId}`
}

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export function registerDeviceRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/devices ─────────────────────────────────────────────────────

  app.get('/admin/devices', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    let plan: Record<string, unknown> | null = null
    try {
      plan = await resolvePlan(c.env, restaurantId)
    } catch {
      // KV unavailable — continue without plan data
    }

    const { data, error } = await admin
      .from('devices')
      .select('id, name, permissions, device_uuid, platform, last_seen_at, created_at')
      .eq('restaurant_id', restaurantId)
      .is('revoked_at', null)
      .order('created_at', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    const deviceCap = typeof plan?.device_cap === 'number' ? plan.device_cap : 3
    const devices = data ?? []

    return c.json({ devices, device_cap: deviceCap, device_count: devices.length })
  })

  // ── POST /admin/devices ────────────────────────────────────────────────────

  app.post('/admin/devices', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = createDeviceSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const plan = await resolvePlan(c.env, restaurantId)
    const deviceCap = typeof plan?.device_cap === 'number' ? plan.device_cap : 3

    const { count } = await admin
      .from('devices')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .is('revoked_at', null)
      .then((r) => ({ count: r.count ?? 0 }))

    if (count >= deviceCap) {
      return c.json({ error: 'plan_limit_reached', limit: deviceCap, current: count }, 402)
    }

    // The device row id IS the device_id baked into the JWT
    const { data: device, error: insertErr } = await admin
      .from('devices')
      .insert({
        restaurant_id: restaurantId,
        name: parsed.data.name,
        permissions: parsed.data.permissions,
      })
      .select('id, name, permissions, device_uuid, platform, last_seen_at, created_at')
      .single()

    if (insertErr || !device) return c.json({ error: 'create_failed' }, 500)

    const deviceToken = generateDeviceToken()
    const tokenPayload = JSON.stringify({
      restaurant_id: restaurantId,
      device_id: (device as { id: string }).id,
      name: (device as { name: string }).name,
      permissions: (device as { permissions: string[] }).permissions,
    })

    await Promise.all([
      c.env.DEVICE_TOKENS.put(deviceTokenKey(deviceToken), tokenPayload, { expirationTtl: DEVICE_TOKEN_TTL }),
      c.env.DEVICE_TOKENS.put(deviceIndexKey(restaurantId, (device as { id: string }).id), deviceToken, { expirationTtl: DEVICE_TOKEN_TTL }),
    ])

    return c.json({ device_token: deviceToken, device }, 201)
  })

  // ── PATCH /admin/devices/:id ───────────────────────────────────────────────

  app.patch('/admin/devices/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')

    const parsed = patchDeviceSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }
    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('devices')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .is('revoked_at', null)
      .select('id, name, permissions, device_uuid, platform, last_seen_at, created_at')
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    // Sync updated permissions into KV so next login gets fresh claims
    if (parsed.data.permissions) {
      const indexKey = deviceIndexKey(restaurantId, id)
      const token = await c.env.DEVICE_TOKENS.get(indexKey)
      if (token) {
        const raw = await c.env.DEVICE_TOKENS.get(deviceTokenKey(token))
        if (raw) {
          try {
            const existing = JSON.parse(raw) as Record<string, unknown>
            await c.env.DEVICE_TOKENS.put(
              deviceTokenKey(token),
              JSON.stringify({ ...existing, permissions: parsed.data.permissions }),
              { expirationTtl: DEVICE_TOKEN_TTL },
            )
          } catch { /* stale KV entry; ignore */ }
        }
      }
    }

    return c.json(data)
  })

  // ── DELETE /admin/devices/:id ──────────────────────────────────────────────

  app.delete('/admin/devices/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')

    // Invalidate KV first — immediate effect (12h JWT still valid, but next
    // login attempt will fail, which is the practical revocation window)
    const indexKey = deviceIndexKey(restaurantId, id)
    const token = await c.env.DEVICE_TOKENS.get(indexKey)
    if (token) {
      await Promise.all([
        c.env.DEVICE_TOKENS.delete(deviceTokenKey(token)),
        c.env.DEVICE_TOKENS.delete(indexKey),
      ])
    }

    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('devices')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .is('revoked_at', null)

    if (error) return c.json({ error: 'not_found' }, 404)

    return c.body(null, 204)
  })
}
