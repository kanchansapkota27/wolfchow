import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

// ── Schemas ────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const createClosureSchema = z.object({
  closure_type: z.enum(['full', 'partial', 'holiday', 'emergency', 'maintenance', 'special']),
  date: z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
  partial_open: z.string().regex(TIME_RE, 'Must be HH:MM').optional(),
  partial_close: z.string().regex(TIME_RE, 'Must be HH:MM').optional(),
  recurring: z.boolean().default(false),
  reason: z.string().max(500).optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export function registerClosureRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/closures ────────────────────────────────────────────────────

  app.get('/admin/closures', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const includePast = c.req.query('include_past') === 'true'

    const admin = createAdminClient(c.env)
    let query = admin
      .from('special_closures')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('date', { ascending: true })

    if (!includePast) {
      const today = new Date().toISOString().slice(0, 10)
      query = query.gte('date', today)
    }

    const { data, error } = await query

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ closures: data ?? [] })
  })

  // ── POST /admin/closures ───────────────────────────────────────────────────

  app.post('/admin/closures', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = createClosureSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const { closure_type, date, partial_open, partial_close } = parsed.data

    // partial type requires both time fields
    if (closure_type === 'partial' && (!partial_open || !partial_close)) {
      return c.json(
        { error: 'partial_times_required', message: 'partial_open and partial_close are required for partial closures' },
        422,
      )
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('special_closures')
      .insert({ ...parsed.data, restaurant_id: restaurantId })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    await invalidateClosureCache(c.env, restaurantId)

    const today = new Date().toISOString().slice(0, 10)
    const isPast = date < today

    const response = c.json(data, 201)
    if (isPast) {
      ;(await response).headers.set('X-Warning', 'closure-in-past')
    }
    return response
  })

  // ── DELETE /admin/closures/:id ─────────────────────────────────────────────

  app.delete('/admin/closures/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('special_closures')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'delete_failed' }, 500)

    await invalidateClosureCache(c.env, restaurantId)
    return c.body(null, 204)
  })
}

async function invalidateClosureCache(env: HonoEnv['Bindings'], restaurantId: string): Promise<void> {
  const cache = new KvCache(env.SETTINGS_CACHE)
  await Promise.all([
    cache.delete(buildKey('hours', restaurantId)),
    cache.delete(buildKey('slots', restaurantId)),
  ])
}
