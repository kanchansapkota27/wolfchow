import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import { resolvePlan } from '../../services/plan'
import type { Broadcaster } from '../../services/realtime'

// ── Schemas ────────────────────────────────────────────────────────────────────

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['single', 'multi']),
  required: z.boolean().default(false),
  availability_state: z.enum(['available', 'unavailable']).default('available'),
})

const patchGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['single', 'multi']).optional(),
  required: z.boolean().optional(),
  availability_state: z.enum(['available', 'unavailable']).optional(),
})

const createOptionSchema = z.object({
  name: z.string().min(1).max(100),
  price_delta: z.number(),
  available: z.boolean().default(true),
})

const patchOptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  price_delta: z.number().optional(),
  available: z.boolean().optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface ModifierRouteDeps {
  broadcaster?: Broadcaster
}

export function registerModifierRoutes(app: Hono<HonoEnv>, deps: ModifierRouteDeps = {}): void {
  // ── GET /admin/menu/modifiers ─────────────────────────────────────────────
  // List all global modifier groups (item_id IS NULL) for this restaurant.

  app.get('/admin/menu/modifiers', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('modifier_groups')
      .select('*, options:modifier_options(*)')
      .eq('restaurant_id', restaurantId)
      .is('item_id', null)
      .order('sort_order', { ascending: true })

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    return c.json({ groups: data ?? [] })
  })

  // ── POST /admin/menu/modifiers ────────────────────────────────────────────
  // Create a global modifier group (item_id = null).

  app.post('/admin/menu/modifiers', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const modifierCap = typeof plan?.modifier_cap === 'number' ? plan.modifier_cap : null

    const parsed = createGroupSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    if (modifierCap !== null) {
      const { count } = await admin
        .from('modifier_groups')
        .select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .is('item_id', null)
        .then((r) => ({ count: r.count ?? 0 }))

      if (count >= modifierCap) {
        return c.json({ error: 'plan_limit_reached', limit: modifierCap, current: count }, 402)
      }
    }

    const { data, error } = await admin
      .from('modifier_groups')
      .insert({ ...parsed.data, item_id: null, restaurant_id: restaurantId })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data, 201)
  })

  // ── PATCH /admin/menu/modifiers/:group_id ─────────────────────────────────

  app.patch('/admin/menu/modifiers/:group_id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const groupId = c.req.param('group_id')

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const parsed = patchGroupSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('modifier_groups')
      .update(parsed.data)
      .eq('id', groupId)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── DELETE /admin/menu/modifiers/:group_id ────────────────────────────────

  app.delete('/admin/menu/modifiers/:group_id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const groupId = c.req.param('group_id')

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const admin = createAdminClient(c.env)

    const { error } = await admin
      .from('modifier_groups')
      .delete()
      .eq('id', groupId)
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'not_found' }, 404)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.body(null, 204)
  })

  // ── POST /admin/menu/modifiers/:group_id/options ──────────────────────────

  app.post('/admin/menu/modifiers/:group_id/options', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const groupId = c.req.param('group_id')

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const parsed = createOptionSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    const { data: group } = await admin
      .from('modifier_groups')
      .select('id')
      .eq('id', groupId)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!group) return c.json({ error: 'not_found' }, 404)

    const priceDeltaCents = Math.round(parsed.data.price_delta * 100)

    const { data, error } = await admin
      .from('modifier_options')
      .insert({ name: parsed.data.name, price_delta: priceDeltaCents, available: parsed.data.available, group_id: groupId, restaurant_id: restaurantId })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data, 201)
  })

  // ── PATCH /admin/menu/modifiers/options/:option_id ────────────────────────

  app.patch('/admin/menu/modifiers/options/:option_id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const optionId = c.req.param('option_id')

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const parsed = patchOptionSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)

    const updates: Record<string, unknown> = { ...parsed.data }
    if (typeof parsed.data.price_delta === 'number') {
      updates.price_delta = Math.round(parsed.data.price_delta * 100)
    }

    const { data: option } = await admin
      .from('modifier_options')
      .select('id, modifier_groups!inner(restaurant_id)')
      .eq('id', optionId)
      .eq('modifier_groups.restaurant_id', restaurantId)
      .single()

    if (!option) return c.json({ error: 'not_found' }, 404)

    const { data, error } = await admin
      .from('modifier_options')
      .update(updates)
      .eq('id', optionId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    await invalidateAndBroadcast(c.env, restaurantId, deps.broadcaster)

    return c.json(data)
  })

  // ── DELETE /admin/menu/modifiers/options/:option_id ───────────────────────

  app.delete('/admin/menu/modifiers/options/:option_id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const optionId = c.req.param('option_id')

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.item_modifiers) {
      return c.json({ error: 'feature_locked', feature: 'item_modifiers' }, 402)
    }

    const admin = createAdminClient(c.env)

    const { data: option } = await admin
      .from('modifier_options')
      .select('id, modifier_groups!inner(restaurant_id)')
      .eq('id', optionId)
      .eq('modifier_groups.restaurant_id', restaurantId)
      .single()

    if (!option) return c.json({ error: 'not_found' }, 404)

    const { error } = await admin
      .from('modifier_options')
      .delete()
      .eq('id', optionId)

    if (error) return c.json({ error: 'delete_failed' }, 500)

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
  // The public menu route (src/routes/public/menu.ts) reads/writes this cache
  // via MENU_CACHE, not SETTINGS_CACHE — deleting from the wrong binding is a
  // silent no-op, leaving the public menu stale for up to KV_TTLS.menu (300s)
  // after any edit.
  const cache = new KvCache(env.MENU_CACHE)
  await cache.delete(buildKey('menu', restaurantId))

  if (broadcaster) {
    broadcaster.broadcast(restaurantId, 'menu_availability_changed', {}, {} as ExecutionContext)
  }
}
