import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

// ── Schemas ────────────────────────────────────────────────────────────────────

const createPromoSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    promo_code: z.string().max(20).optional(),
    discount_type: z.enum(['percentage', 'fixed', 'free_item', 'bogo']),
    discount_value: z.number().positive(),
    free_item_id: z.string().uuid().optional(),
    minimum_order_amount: z.number().min(0).optional(),
    usage_limit: z.number().int().positive().optional(),
    auto_apply: z.boolean().default(false),
    start_time: z.string().datetime().optional(),
    end_time: z.string().datetime().optional(),
    active_days: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.end_time && data.start_time && data.end_time <= data.start_time) {
      ctx.addIssue({ code: 'custom', message: 'end_time must be after start_time', path: ['end_time'] })
    }
    if (!data.auto_apply && !data.promo_code) {
      ctx.addIssue({ code: 'custom', message: 'Either auto_apply or promo_code required', path: [] })
    }
    if (['free_item', 'bogo'].includes(data.discount_type) && !data.free_item_id) {
      ctx.addIssue({ code: 'custom', message: 'free_item_id required for free_item/bogo discount types', path: ['free_item_id'] })
    }
    if (data.discount_type === 'percentage' && data.discount_value > 100) {
      ctx.addIssue({ code: 'custom', message: 'percentage discount cannot exceed 100', path: ['discount_value'] })
    }
  })

const patchPromoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  discount_value: z.number().positive().optional(),
  minimum_order_amount: z.number().min(0).optional(),
  usage_limit: z.number().int().positive().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  active_days: z.array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])).optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

async function invalidatePromoKv(kv: KVNamespace, restaurantId: string): Promise<void> {
  const cache = new KvCache(kv)
  await cache.delete(buildKey('promos', restaurantId))
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerPromotionsRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/promotions ──────────────────────────────────────────────────

  app.get('/admin/promotions', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('promotions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (error) return c.json({ error: 'fetch_failed' }, 500)
    return c.json({ promotions: data ?? [] })
  })

  // ── POST /admin/promotions ─────────────────────────────────────────────────

  app.post('/admin/promotions', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = createPromoSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Check promotions_enabled feature flag from plan KV
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
    if (!plan?.promotions_enabled) {
      return c.json({ error: 'feature_locked', feature: 'promotions_enabled' }, 402)
    }

    // Validate free_item_id belongs to this restaurant
    if (parsed.data.free_item_id) {
      const { data: item } = await admin
        .from('menu_items')
        .select('id')
        .eq('id', parsed.data.free_item_id)
        .eq('restaurant_id', restaurantId)
        .single()
      if (!item) return c.json({ error: 'free_item_not_found' }, 422)
    }

    // Check promo_code uniqueness within restaurant
    if (parsed.data.promo_code) {
      const { data: existing } = await admin
        .from('promotions')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('promo_code', parsed.data.promo_code)
        .maybeSingle()
      if (existing) return c.json({ error: 'duplicate_promo_code' }, 409)
    }

    const { data, error } = await admin
      .from('promotions')
      .insert({ ...parsed.data, restaurant_id: restaurantId, active: true, usage_count: 0 })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    await invalidatePromoKv(c.env.SETTINGS_CACHE, restaurantId)
    return c.json(data, 201)
  })

  // ── PATCH /admin/promotions/:id ────────────────────────────────────────────

  app.patch('/admin/promotions/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')

    const parsed = patchPromoSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('promotions')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidatePromoKv(c.env.SETTINGS_CACHE, restaurantId)
    return c.json(data)
  })

  // ── PATCH /admin/promotions/:id/toggle ────────────────────────────────────

  app.patch('/admin/promotions/:id/toggle', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)

    const { data: current } = await admin
      .from('promotions')
      .select('active')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!current) return c.json({ error: 'not_found' }, 404)

    const { data, error } = await admin
      .from('promotions')
      .update({ active: !(current as { active: boolean }).active })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    await invalidatePromoKv(c.env.SETTINGS_CACHE, restaurantId)
    return c.json(data)
  })

  // ── DELETE /admin/promotions/:id ───────────────────────────────────────────

  app.delete('/admin/promotions/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)

    const { data: promo } = await admin
      .from('promotions')
      .select('id, usage_count')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!promo) return c.json({ error: 'not_found' }, 404)

    if ((promo as { usage_count: number }).usage_count > 0) {
      return c.json({ error: 'promo_has_usage', message: 'Deactivate instead of deleting' }, 409)
    }

    const { error } = await admin.from('promotions').delete().eq('id', id).eq('restaurant_id', restaurantId)
    if (error) return c.json({ error: 'delete_failed' }, 500)

    await invalidatePromoKv(c.env.SETTINGS_CACHE, restaurantId)
    return c.body(null, 204)
  })
}
