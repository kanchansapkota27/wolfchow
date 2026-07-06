import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import type { Broadcaster } from '../../services/realtime'

// ── Schemas ────────────────────────────────────────────────────────────────────

const pauseSchema = z
  .object({
    mode: z.enum(['timed', 'manual', 'rest_of_day']),
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

// ── Helper ─────────────────────────────────────────────────────────────────────

interface HoursRow {
  day_of_week: number
  close_time: string
  active: boolean
}

/**
 * Compute pause_until for rest_of_day mode.
 * Reads today's close_time from hours KV (by UTC day-of-week) and returns
 * an ISO timestamp for close_time on today's UTC date.
 */
function restOfDayUntil(hours: HoursRow[]): string | null {
  const now = new Date()
  const todayDay = now.getUTCDay()
  const row = hours.find((h) => h.day_of_week === todayDay && h.active)
  if (!row) return null

  const [hh, mm] = row.close_time.split(':').map(Number)
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0))
  return until.toISOString()
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export interface PauseRouteDeps {
  broadcaster?: Broadcaster
}

export function registerPauseRoutes(app: Hono<HonoEnv>, deps: PauseRouteDeps = {}): void {
  // ── GET /admin/orders/pause ────────────────────────────────────────────────

  app.get('/admin/orders/pause', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('orders_paused, pause_mode, pause_until, pause_reason, pause_scheduled_orders')
      .eq('id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    return c.json(data)
  })

  // ── POST /admin/orders/pause ───────────────────────────────────────────────

  app.post('/admin/orders/pause', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = pauseSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const { mode, duration_minutes, reason, pause_scheduled_orders } = parsed.data

    let pause_until: string | null = null

    if (mode === 'timed') {
      pause_until = new Date(Date.now() + duration_minutes! * 60000).toISOString()
    } else if (mode === 'rest_of_day') {
      const cache = new KvCache(c.env.SETTINGS_CACHE)
      const hours = await cache.get<HoursRow[]>(buildKey('hours', restaurantId))
      pause_until = restOfDayUntil(hours ?? [])
    }
    // manual: pause_until stays null

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

  // ── POST /admin/orders/unpause ─────────────────────────────────────────────

  app.post('/admin/orders/unpause', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

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
