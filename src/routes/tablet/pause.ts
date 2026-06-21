import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import type { Broadcaster } from '../../services/realtime'

// ── Schema ─────────────────────────────────────────────────────────────────────

const pauseSchema = z
  .object({
    mode: z.enum(['timed', 'manual']),
    duration_minutes: z.number().int().min(5).max(480).optional(),
    reason: z.string().max(200).optional(),
    pause_scheduled_orders: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'timed' && val.duration_minutes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['duration_minutes'], message: 'duration_minutes is required when mode is timed' })
    }
  })

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Route deps ─────────────────────────────────────────────────────────────────

export interface PauseRouteDeps {
  broadcaster?: Broadcaster
}

export function registerPauseRoutes(app: Hono<HonoEnv>, deps: PauseRouteDeps = {}): void {
  // ── POST /tablet/orders/pause ──────────────────────────────────────────────

  app.post('/tablet/orders/pause', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions?.includes('orders:pause')) {
      return c.json({ error: 'forbidden', required_permission: 'orders:pause' }, 403)
    }

    const parsed = pauseSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const { mode, duration_minutes, reason, pause_scheduled_orders } = parsed.data

    const pause_until = mode === 'timed'
      ? new Date(Date.now() + duration_minutes! * 60000).toISOString()
      : null

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .update({
        orders_paused: true,
        pause_mode: mode,
        pause_until,
        pause_reason: reason ?? null,
        pause_scheduled_orders,
      })
      .eq('id', restaurantId)
      .select('orders_paused, pause_mode, pause_until, pause_reason, pause_scheduled_orders')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    deps.broadcaster?.broadcast(
      restaurantId,
      'pause_state_changed',
      { paused: true, mode, pause_until, reason: reason ?? null },
      {} as ExecutionContext,
    )

    return c.json(data)
  })

  // ── POST /tablet/orders/unpause ────────────────────────────────────────────

  app.post('/tablet/orders/unpause', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions?.includes('orders:pause')) {
      return c.json({ error: 'forbidden', required_permission: 'orders:pause' }, 403)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .update({
        orders_paused: false,
        pause_mode: null,
        pause_until: null,
        pause_reason: null,
        pause_scheduled_orders: false,
      })
      .eq('id', restaurantId)
      .select('orders_paused, pause_mode, pause_until, pause_reason, pause_scheduled_orders')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    deps.broadcaster?.broadcast(
      restaurantId,
      'pause_state_changed',
      { paused: false },
      {} as ExecutionContext,
    )

    return c.json(data)
  })
}
