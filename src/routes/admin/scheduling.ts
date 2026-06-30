import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import { resolvePlan } from '../../services/plan'
import { computeSlots, type HoursRow, type ClosureRow } from '../../services/slots'

// ── Schemas ────────────────────────────────────────────────────────────────────

const patchSchedulingSchema = z.object({
  base_prep_minutes: z.number().int().min(5).max(120).optional(),
  scheduling_interval: z.union([z.literal(15), z.literal(30)]).optional(),
  future_days_allowed: z.number().int().min(0).max(30).optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerSchedulingRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/scheduling ──────────────────────────────────────────────────

  app.get('/admin/scheduling', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.scheduled_orders_enabled) {
      return c.json({ error: 'feature_locked', feature: 'scheduled_orders_enabled' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('base_prep_minutes, scheduling_interval, future_days_allowed')
      .eq('id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    return c.json(data)
  })

  // ── PATCH /admin/scheduling ────────────────────────────────────────────────

  app.patch('/admin/scheduling', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.scheduled_orders_enabled) {
      return c.json({ error: 'feature_locked', feature: 'scheduled_orders_enabled' }, 402)
    }

    const parsed = patchSchedulingSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .update(parsed.data)
      .eq('id', restaurantId)
      .select('base_prep_minutes, scheduling_interval, future_days_allowed')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await Promise.all([
      cache.delete(buildKey('settings', `widget:${restaurantId}`)),
      cache.delete(buildKey('slots', restaurantId)),
    ])

    return c.json(data)
  })

  // ── GET /admin/scheduling/preview ─────────────────────────────────────────

  app.get('/admin/scheduling/preview', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.scheduled_orders_enabled) {
      return c.json({ error: 'feature_locked', feature: 'scheduled_orders_enabled' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { data: restaurant, error } = await admin
      .from('restaurants')
      .select('base_prep_minutes, scheduling_interval, future_days_allowed, timezone')
      .eq('id', restaurantId)
      .single()

    if (error || !restaurant) return c.json({ error: 'not_found' }, 404)

    const r = restaurant as Record<string, unknown>
    const basePrepMinutes = (r.base_prep_minutes as number | null) ?? 20
    const intervalMinutes = (r.scheduling_interval as number | null) ?? 15
    const futureDays = (r.future_days_allowed as number | null) ?? 7
    const timezone = (r.timezone as string | null) || 'UTC'

    // Fetch hours (KV cache or DB)
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    let hours: HoursRow[] = []
    const cachedHours = await cache.get<HoursRow[]>(buildKey('hours', restaurantId))
    if (cachedHours) {
      hours = cachedHours
    } else {
      const { data: hoursData } = await admin
        .from('operating_hours')
        .select('day_of_week, open_time, close_time, active, last_order_offset_minutes, crosses_midnight')
        .eq('restaurant_id', restaurantId)
      hours = (hoursData ?? []).map((row: Record<string, unknown>) => ({
        day_of_week: row.day_of_week as number,
        open_time: (row.open_time as string).slice(0, 5),
        close_time: (row.close_time as string).slice(0, 5),
        active: row.active as boolean,
        last_order_offset_minutes: row.last_order_offset_minutes as number,
        crosses_midnight: row.crosses_midnight as boolean,
      }))
    }

    // Fetch upcoming closures
    const today = new Date().toISOString().slice(0, 10)
    const { data: closuresData } = await admin
      .from('special_closures')
      .select('closure_type, date, partial_open, partial_close, recurring')
      .eq('restaurant_id', restaurantId)
      .gte('date', today)

    const closures: ClosureRow[] = (closuresData ?? []).map((row: Record<string, unknown>) => ({
      closure_type: row.closure_type as string,
      date: row.date as string,
      partial_open: row.partial_open as string | null,
      partial_close: row.partial_close as string | null,
      recurring: row.recurring as boolean,
    }))

    const fromMs = Date.now() + basePrepMinutes * 60000
    const allSlots = computeSlots(
      fromMs,
      { base_prep_minutes: basePrepMinutes, interval_minutes: intervalMinutes, future_days: futureDays, timezone },
      hours,
      closures,
    )

    return c.json({ slots: allSlots.slice(0, 10) })
  })
}
