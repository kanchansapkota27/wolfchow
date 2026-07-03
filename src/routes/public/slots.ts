import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache, KV_TTLS } from '../../services/kv'
import { computeSlots, type HoursRow, type ClosureRow } from '../../services/slots'

export function registerPublicSlotsRoutes(app: Hono<HonoEnv>): void {
  app.get('/public/:slug/slots', async (c) => {
    const slug = c.req.param('slug')
    if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) {
      return c.json({ error: 'invalid_slug' }, 400)
    }

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_PUBLIC.limit({ key: `pub:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const admin = createAdminClient(c.env)

    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id, timezone, base_prep_minutes, scheduling_interval, future_days_allowed, plan_id')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (restaurantError) return c.json({ error: 'db_error' }, 500)
    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    const r = restaurant as Record<string, unknown>

    // Verify plan allows scheduled orders
    const planId = r.plan_id as string | null
    if (!planId) return c.json({ error: 'feature_locked' }, 402)

    const { data: plan } = await admin
      .from('plans')
      .select('feature_flags')
      .eq('id', planId)
      .maybeSingle()

    const flags = (plan as Record<string, unknown> | null)?.feature_flags as Record<string, boolean> | null
    if (!flags?.scheduled_orders_enabled) return c.json({ error: 'feature_locked' }, 402)

    const restaurantId = r.id as string
    const timezone = (r.timezone as string | null) || 'UTC'
    const basePrepMinutes = (r.base_prep_minutes as number | null) ?? 20
    const intervalMinutes = (r.scheduling_interval as number | null) ?? 15
    const futureDays = (r.future_days_allowed as number | null) ?? 7

    // Return cached slot list if fresh (client filters past slots)
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const cacheKey = buildKey('slots', restaurantId)
    const cached = await cache.get<string[]>(cacheKey)
    if (cached) return c.json({ slots: cached })

    // Fetch operating hours (try KV first, fall back to DB)
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

    // Fetch upcoming closures (within the future-days window)
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
    const slots = computeSlots(
      fromMs,
      { base_prep_minutes: basePrepMinutes, interval_minutes: intervalMinutes, future_days: futureDays, timezone },
      hours,
      closures,
    )

    await cache.set(cacheKey, slots, KV_TTLS['slots'] ?? 300)
    return c.json({ slots })
  })
}
