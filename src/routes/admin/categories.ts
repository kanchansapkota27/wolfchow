import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import type { Broadcaster } from '../../services/realtime'

// ── Schemas ────────────────────────────────────────────────────────────────────

const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
  availability_state: z.enum(['available', 'unavailable', 'scheduled']).default('available'),
})

const patchCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sort_order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
  availability_state: z.enum(['available', 'unavailable', 'scheduled']).optional(),
})

const reorderSchema = z.array(
  z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0) }),
).min(1)

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface CategoryRouteDeps {
  broadcaster?: Broadcaster
}

export function registerCategoryRoutes(app: Hono<HonoEnv>, deps: CategoryRouteDeps = {}): void {
  // ── GET /admin/menu/categories ──────────────────────────────────────────────

  app.get('/admin/menu/categories', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('menu_categories')
      .select('*, menu_items(count)')
      .eq('restaurant_id', restaurantId)
      .order('sort_order', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    // Flatten the nested count into item_count
    const categories = (data ?? []).map((cat: Record<string, unknown>) => {
      const items = cat['menu_items']
      const item_count =
        Array.isArray(items) && items[0] && typeof (items[0] as Record<string, unknown>).count === 'number'
          ? (items[0] as Record<string, unknown>).count
          : 0
      const { menu_items: _, ...rest } = cat
      return { ...rest, item_count }
    })

    return c.json({ categories })
  })

  // ── POST /admin/menu/categories ─────────────────────────────────────────────

  app.post('/admin/menu/categories', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = createCategorySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Check category_cap from plan KV
    const cache = new KvCache(c.env.SETTINGS_CACHE)
    const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
    const categoryCap = typeof plan?.category_cap === 'number' ? plan.category_cap : null

    if (categoryCap !== null) {
      const { count } = await admin
        .from('menu_categories')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count >= categoryCap) {
        return c.json({ error: 'plan_limit_reached', limit: categoryCap, current: count }, 402)
      }
    }

    const { data, error } = await admin
      .from('menu_categories')
      .insert({ ...parsed.data, restaurant_id: restaurantId })
      .select()
      .single()

    if (error) {
      return c.json({ error: 'create_failed' }, 500)
    }

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data, 201)
  })

  // ── PATCH /admin/menu/categories/:id ───────────────────────────────────────

  app.patch('/admin/menu/categories/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const parsed = patchCategorySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('menu_categories')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── DELETE /admin/menu/categories/:id ──────────────────────────────────────

  app.delete('/admin/menu/categories/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const id = c.req.param('id')

    const admin = createAdminClient(c.env)

    // Guard: count active items in the category
    const { count: itemCount } = await admin
      .from('menu_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', id)
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .then((r) => ({ count: r.count ?? 0 }))

    if (itemCount > 0) {
      return c.json({ error: 'category_has_items', item_count: itemCount }, 409)
    }

    // Soft-delete: set active = false
    const { data, error } = await admin
      .from('menu_categories')
      .update({ active: false })
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })

  // ── POST /admin/menu/categories/reorder ─────────────────────────────────────

  app.post('/admin/menu/categories/reorder', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = reorderSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Batch upsert sort_orders — update each row individually in parallel
    // (Supabase doesn't support multi-row UPDATE with different values in one call)
    const updates = await Promise.all(
      parsed.data.map(({ id, sort_order }) =>
        admin
          .from('menu_categories')
          .update({ sort_order })
          .eq('id', id)
          .eq('restaurant_id', restaurantId),
      ),
    )

    const failed = updates.find((r) => r.error)
    if (failed?.error) return c.json({ error: 'reorder_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function invalidateAndBroadcast(
  env: HonoEnv['Bindings'],
  restaurantId: string,
  broadcaster?: Broadcaster,
): Promise<void> {
  const cache = new KvCache(env.SETTINGS_CACHE)
  await cache.delete(buildKey('menu', restaurantId))

  if (broadcaster) {
    // fire-and-forget; no ExecutionContext available here
    broadcaster.broadcast(restaurantId, 'menu_availability_changed', {}, {} as ExecutionContext)
  }
}
