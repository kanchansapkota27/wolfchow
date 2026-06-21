import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import { generatePresignedPutUrl, randomId } from '../../services/r2'
import type { Broadcaster } from '../../services/realtime'

// ── Constants ──────────────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  'vegan', 'vegetarian', 'spicy', 'gluten_free',
  'contains_nuts', 'halal', 'dairy_free', 'contains_alcohol',
])

const AVAILABILITY_STATES = ['available', 'unavailable', 'scheduled', 'out_of_stock'] as const
type AvailabilityState = (typeof AVAILABILITY_STATES)[number]

// ── Schemas ────────────────────────────────────────────────────────────────────

const tagsSchema = z
  .array(z.string())
  .optional()
  .superRefine((tags, ctx) => {
    if (!tags) return
    for (const tag of tags) {
      if (!ALLOWED_TAGS.has(tag)) {
        ctx.addIssue({ code: 'custom', message: `Unknown tag: ${tag}`, path: [] })
      }
    }
  })

const createItemSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().optional(),
  price: z.number().min(0), // 0 is valid for items that use variants for pricing
  category_id: z.string().uuid(),
  availability_state: z.enum(AVAILABILITY_STATES).default('available'),
  tags: tagsSchema,
})

const patchItemSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().optional(),
  price: z.number().gt(0).optional(),
  category_id: z.string().uuid().optional(),
  availability_state: z.enum(AVAILABILITY_STATES).optional(),
  tags: tagsSchema,
})

const availabilitySchema = z.object({
  state: z.enum(AVAILABILITY_STATES),
  restore_at: z.string().datetime().optional(),
})

const createVariantSchema = z.object({
  name: z.string().min(1).max(30),
  price: z.number().min(0),
  is_default: z.boolean().default(false),
  available: z.boolean().default(true),
})

const patchVariantSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  price: z.number().min(0).optional(),
  is_default: z.boolean().optional(),
  available: z.boolean().optional(),
})

const variantReorderSchema = z
  .array(z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0) }))
  .min(1)

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Deps ───────────────────────────────────────────────────────────────────────

export interface ItemRouteDeps {
  broadcaster?: Broadcaster
  generateUploadUrl?: (env: HonoEnv['Bindings'], key: string, expiresIn: number) => Promise<string>
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerItemRoutes(app: Hono<HonoEnv>, deps: ItemRouteDeps = {}): void {
  const getUploadUrl = deps.generateUploadUrl ?? generatePresignedPutUrl

  // ── GET /admin/menu/items ─────────────────────────────────────────────────

  app.get('/admin/menu/items', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const categoryId = c.req.query('category_id')

    const admin = createAdminClient(c.env)
    let q = admin
      .from('menu_items')
      .select('*, modifier_groups(id)')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (categoryId) q = q.eq('category_id', categoryId)

    const { data, error } = await q
    if (error) return c.json({ error: 'fetch_failed' }, 500)

    const items = (data ?? []).map((item: Record<string, unknown>) => {
      const groups = item['modifier_groups']
      const modifier_group_count = Array.isArray(groups) ? groups.length : 0
      const { modifier_groups: _, ...rest } = item
      return { ...rest, modifier_group_count }
    })

    return c.json({ items })
  })

  // ── POST /admin/menu/items ────────────────────────────────────────────────

  app.post('/admin/menu/items', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = createItemSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // item_cap check from plan KV
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
    const itemCap = typeof plan?.item_cap === 'number' ? plan.item_cap : null

    if (itemCap !== null) {
      const { count } = await admin
        .from('menu_items')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count >= itemCap) {
        return c.json({ error: 'plan_limit_reached', limit: itemCap, current: count }, 402)
      }
    }

    const { data, error } = await admin
      .from('menu_items')
      .insert({ ...parsed.data, restaurant_id: restaurantId })
      .select()
      .single()

    if (error) {
      if (error.code === '23503') {
        const isCategoryFk = error.message?.includes('category_id')
        return isCategoryFk
          ? c.json({ error: 'category_not_found' }, 422)
          : c.json({ error: 'restaurant_not_found' }, 404)
      }
      return c.json({ error: 'create_failed' }, 500)
    }

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data, 201)
  })

  // ── PATCH /admin/menu/items/:id ───────────────────────────────────────────

  app.patch('/admin/menu/items/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const parsed = patchItemSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('menu_items')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── DELETE /admin/menu/items/:id ──────────────────────────────────────────

  app.delete('/admin/menu/items/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('menu_items')
      .update({ active: false })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })

  // ── POST /admin/menu/items/:id/image ─────────────────────────────────────

  app.post('/admin/menu/items/:id/image', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const itemId = c.req.param('id')

    // Check menu_photos feature flag from plan KV
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
    const flags = plan?.feature_flags as Record<string, unknown> | undefined
    const photosEnabled = flags?.menu_photos === true

    if (!photosEnabled) {
      return c.json(
        { error: 'feature_locked', feature: 'menu_photos', required_tier: 'growth' },
        402,
      )
    }

    const r2Key = `${restaurantId}/${itemId}/${randomId()}.webp`
    const uploadUrl = await getUploadUrl(c.env, r2Key, 15 * 60)

    return c.json({ upload_url: uploadUrl, r2_key: r2Key }, 201)
  })

  // ── PATCH /admin/menu/items/:id/availability ──────────────────────────────

  app.patch('/admin/menu/items/:id/availability', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const parsed = availabilitySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('menu_items')
      .update({
        availability_state: parsed.data.state,
        restore_at: parsed.data.restore_at ?? null,
      })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── GET /admin/menu/items/:item_id/variants ───────────────────────────────

  app.get('/admin/menu/items/:item_id/variants', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const itemId = c.req.param('item_id')

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('item_variants')
      .select('*')
      .eq('item_id', itemId)
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ variants: data ?? [] })
  })

  // ── POST /admin/menu/items/:item_id/variants ──────────────────────────────

  app.post('/admin/menu/items/:item_id/variants', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const itemId = c.req.param('item_id')

    const parsed = createVariantSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Verify item belongs to this restaurant
    const { data: parentItem } = await admin
      .from('menu_items')
      .select('id')
      .eq('id', itemId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!parentItem) return c.json({ error: 'not_found' }, 404)

    // Count existing variants to determine sort_order + first-variant flag
    const { count: existingCount } = await admin
      .from('item_variants')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', itemId)
      .eq('restaurant_id', restaurantId)
      .then((r) => ({ count: r.count ?? 0 }))

    const isFirst = existingCount === 0

    // If is_default: true, unset existing defaults first
    if (parsed.data.is_default) {
      await admin
        .from('item_variants')
        .update({ is_default: false })
        .eq('item_id', itemId)
        .eq('restaurant_id', restaurantId)
    }

    const { data, error } = await admin
      .from('item_variants')
      .insert({
        ...parsed.data,
        item_id: itemId,
        restaurant_id: restaurantId,
        sort_order: existingCount,
      })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    // First variant: set has_variants = true on the parent item
    if (isFirst) {
      await admin
        .from('menu_items')
        .update({ has_variants: true })
        .eq('id', itemId)
        .eq('restaurant_id', restaurantId)
    }

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data, 201)
  })

  // ── POST /admin/menu/items/:item_id/variants/reorder ─────────────────────

  app.post('/admin/menu/items/:item_id/variants/reorder', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = variantReorderSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const updates = await Promise.all(
      parsed.data.map(({ id, sort_order }) =>
        admin
          .from('item_variants')
          .update({ sort_order })
          .eq('id', id)
          .eq('restaurant_id', restaurantId),
      ),
    )

    if (updates.find((r) => r.error)) return c.json({ error: 'reorder_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })

  // ── PATCH /admin/menu/variants/:id ────────────────────────────────────────

  app.patch('/admin/menu/variants/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const parsed = patchVariantSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)

    // If setting is_default=true, unset siblings first
    if (parsed.data.is_default === true) {
      const { data: current } = await admin
        .from('item_variants')
        .select('item_id')
        .eq('id', id)
        .eq('restaurant_id', restaurantId)
        .single()

      if (current) {
        await admin
          .from('item_variants')
          .update({ is_default: false })
          .eq('item_id', (current as Record<string, unknown>).item_id as string)
          .eq('restaurant_id', restaurantId)
          .neq('id', id)
      }
    }

    const { data, error } = await admin
      .from('item_variants')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── DELETE /admin/menu/variants/:id ──────────────────────────────────────

  app.delete('/admin/menu/variants/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)

    // Fetch the variant to check is_default and item_id
    const { data: variant } = await admin
      .from('item_variants')
      .select('item_id, is_default, sort_order')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!variant) return c.json({ error: 'not_found' }, 404)

    const v = variant as { item_id: string; is_default: boolean; sort_order: number }

    // Count siblings
    const { count: siblingCount } = await admin
      .from('item_variants')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', v.item_id)
      .eq('restaurant_id', restaurantId)
      .neq('id', id)
      .then((r) => ({ count: r.count ?? 0 }))

    if (siblingCount === 0) {
      return c.json({ error: 'last_variant', message: 'Item must have at least one variant or a base price' }, 409)
    }

    // If deleting the default, promote next sibling by sort_order
    if (v.is_default) {
      const { data: nextVariant } = await admin
        .from('item_variants')
        .select('id')
        .eq('item_id', v.item_id)
        .eq('restaurant_id', restaurantId)
        .neq('id', id)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single()

      if (nextVariant) {
        await admin
          .from('item_variants')
          .update({ is_default: true })
          .eq('id', (nextVariant as Record<string, unknown>).id as string)
          .eq('restaurant_id', restaurantId)
      }
    }

    const { error } = await admin
      .from('item_variants')
      .delete()
      .eq('id', id)
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'delete_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function invalidateAndBroadcast(
  env: HonoEnv['Bindings'],
  restaurantId: string,
  broadcaster?: Broadcaster,
): Promise<void> {
  const cache = new KvCache(env.SETTINGS_CACHE)
  await cache.delete(buildKey('menu', restaurantId))
  if (broadcaster) {
    broadcaster.broadcast(restaurantId, 'menu_availability_changed', {}, {} as ExecutionContext)
  }
}
