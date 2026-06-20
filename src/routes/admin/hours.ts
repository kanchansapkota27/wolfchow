import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

// ── Schemas ────────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const daySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string().regex(TIME_RE, 'Must be HH:MM (00:00–23:59)'),
  close_time: z.string().regex(TIME_RE, 'Must be HH:MM (00:00–23:59)'),
  active: z.boolean().default(true),
  last_order_offset_minutes: z.number().int().min(0).max(240).default(0),
})

const putHoursSchema = z.array(daySchema).length(7)

const patchDaySchema = z.object({
  open_time: z.string().regex(TIME_RE, 'Must be HH:MM').optional(),
  close_time: z.string().regex(TIME_RE, 'Must be HH:MM').optional(),
  active: z.boolean().optional(),
  last_order_offset_minutes: z.number().int().min(0).max(240).optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

/** Returns true when a slot crosses midnight (e.g. 22:00 → 02:00). */
function detectCrossesMidnight(open: string, close: string): boolean {
  if (close === '00:00' && open > '00:00') return true
  return close < open
}

/** Default row for a day that has no DB record (closed). */
function closedDefault(day: number, restaurantId: string) {
  return {
    restaurant_id: restaurantId,
    day_of_week: day,
    open_time: '09:00',
    close_time: '21:00',
    active: false,
    last_order_offset_minutes: 0,
    crosses_midnight: false,
  }
}

export function registerHoursRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/hours ───────────────────────────────────────────────────────

  app.get('/admin/hours', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('operating_hours')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('day_of_week', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    // Build a 7-slot array, filling any missing days with a closed default
    const byDay = new Map((data ?? []).map((row: Record<string, unknown>) => [row['day_of_week'] as number, row]))
    const hours = Array.from({ length: 7 }, (_, i) => byDay.get(i) ?? closedDefault(i, restaurantId))

    return c.json({ hours })
  })

  // ── PUT /admin/hours ───────────────────────────────────────────────────────

  app.put('/admin/hours', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = putHoursSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    const rows = parsed.data.map((day) => ({
      ...day,
      restaurant_id: restaurantId,
      crosses_midnight: detectCrossesMidnight(day.open_time, day.close_time),
    }))

    const { data, error } = await admin
      .from('operating_hours')
      .upsert(rows, { onConflict: 'restaurant_id,day_of_week' })
      .select()

    if (error) return c.json({ error: 'upsert_failed' }, 500)

    await invalidateHoursCache(c.env, restaurantId)

    return c.json({ hours: data })
  })

  // ── PATCH /admin/hours/:day ────────────────────────────────────────────────

  app.patch('/admin/hours/:day', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const dayParam = parseInt(c.req.param('day'), 10)
    if (isNaN(dayParam) || dayParam < 0 || dayParam > 6) {
      return c.json({ error: 'invalid_day', message: 'day must be 0–6' }, 422)
    }

    const parsed = patchDaySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)

    // Fetch current row to resolve crosses_midnight if times are changing
    const { data: current } = await admin
      .from('operating_hours')
      .select('open_time, close_time')
      .eq('restaurant_id', restaurantId)
      .eq('day_of_week', dayParam)
      .single()

    const updates: Record<string, unknown> = { ...parsed.data }

    if (parsed.data.open_time !== undefined || parsed.data.close_time !== undefined) {
      const open = parsed.data.open_time ?? (current as Record<string, string> | null)?.open_time ?? '09:00'
      const close = parsed.data.close_time ?? (current as Record<string, string> | null)?.close_time ?? '21:00'
      updates.crosses_midnight = detectCrossesMidnight(open, close)
    }

    const { data, error } = await admin
      .from('operating_hours')
      .update(updates)
      .eq('restaurant_id', restaurantId)
      .eq('day_of_week', dayParam)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateHoursCache(c.env, restaurantId)

    return c.json(data)
  })
}

async function invalidateHoursCache(env: HonoEnv['Bindings'], restaurantId: string): Promise<void> {
  const cache = new KvCache(env.SETTINGS_CACHE)
  await cache.delete(buildKey('hours', restaurantId))
}
