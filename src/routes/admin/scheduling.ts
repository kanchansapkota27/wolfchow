import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

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

// ── Slot preview helpers ───────────────────────────────────────────────────────

interface HoursRow {
  day_of_week: number
  open_time: string    // HH:MM
  close_time: string   // HH:MM
  active: boolean
  last_order_offset_minutes: number
  crosses_midnight: boolean
}

/** Parse HH:MM into total minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Compute the next 10 available order slots starting from `fromMs` (epoch ms).
 * Slots must fall within active operating hours windows.
 * Advances in `intervalMinutes` steps up to `futureDays` days ahead.
 * Falls back to always-open if no hours rows are provided.
 */
function computeSlots(
  fromMs: number,
  intervalMinutes: number,
  futureDays: number,
  hours: HoursRow[],
): string[] {
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]))
  const slots: string[] = []

  // Round `fromMs` up to the next interval boundary (UTC minutes)
  const fromTotalMins = Math.floor(fromMs / 60000)
  const remainder = fromTotalMins % intervalMinutes
  const startMins = remainder === 0 ? fromTotalMins : fromTotalMins + (intervalMinutes - remainder)

  const limitMins = startMins + futureDays * 24 * 60

  for (let candidate = startMins; candidate < limitMins && slots.length < 10; candidate += intervalMinutes) {
    const candidateMs = candidate * 60000
    const d = new Date(candidateMs)
    const dayOfWeek = d.getUTCDay()
    const minuteOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()

    const row = byDay.get(dayOfWeek)

    if (!row || !hours.length) {
      // No hours configured → always open
      slots.push(new Date(candidateMs).toISOString())
      continue
    }

    if (!row.active) continue

    const openMins = toMinutes(row.open_time)
    const rawCloseMins = toMinutes(row.close_time)
    const lastOrderMins = rawCloseMins - row.last_order_offset_minutes

    if (row.crosses_midnight) {
      // Window spans two calendar days: open → 1440 OR 0 → lastOrder
      if (minuteOfDay >= openMins || minuteOfDay < lastOrderMins) {
        slots.push(new Date(candidateMs).toISOString())
      }
    } else {
      if (minuteOfDay >= openMins && minuteOfDay < lastOrderMins) {
        slots.push(new Date(candidateMs).toISOString())
      }
    }
  }

  return slots
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerSchedulingRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/scheduling ──────────────────────────────────────────────────

  app.get('/admin/scheduling', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

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
    await cache.delete(buildKey('settings', restaurantId))

    return c.json(data)
  })

  // ── GET /admin/scheduling/preview ─────────────────────────────────────────

  app.get('/admin/scheduling/preview', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data: restaurant, error } = await admin
      .from('restaurants')
      .select('base_prep_minutes, scheduling_interval, future_days_allowed')
      .eq('id', restaurantId)
      .single()

    if (error || !restaurant) return c.json({ error: 'not_found' }, 404)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const hoursRaw = await cache.get<HoursRow[]>(buildKey('hours', restaurantId))
    const hours = hoursRaw ?? []

    const r = restaurant as { base_prep_minutes: number; scheduling_interval: number; future_days_allowed: number }
    const fromMs = Date.now() + r.base_prep_minutes * 60000
    const slots = computeSlots(fromMs, r.scheduling_interval, r.future_days_allowed || 7, hours)

    return c.json({ slots })
  })
}
