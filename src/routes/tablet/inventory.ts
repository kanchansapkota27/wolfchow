import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import type { Broadcaster } from '../../services/realtime'

const AVAILABILITY_STATES = ['available', 'unavailable', 'scheduled', 'out_of_stock'] as const

const availabilitySchema = z.object({
  availability_state: z.enum(AVAILABILITY_STATES),
  // Nullable, not just optional — restoring to "available" explicitly sends
  // restore_at: null to clear any prior timed-restore timestamp.
  restore_at: z.string().datetime().nullable().optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface InventoryRouteDeps {
  broadcaster?: Broadcaster
}

export function registerInventoryRoutes(app: Hono<HonoEnv>, deps: InventoryRouteDeps = {}): void {
  // ── GET /tablet/inventory ──────────────────────────────────────────────────

  app.get('/tablet/inventory', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)

    const [categoriesRes, itemsRes] = await Promise.all([
      admin
        .from('menu_categories')
        .select('id, name, availability_state, sort_order')
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true }),
      admin
        .from('menu_items')
        .select('id, name, category_id, availability_state, restore_at')
        .eq('restaurant_id', restaurantId)
        .order('sort_order', { ascending: true }),
    ])

    // Map sort_order → position so the frontend type stays stable
    const categories = (categoriesRes.data ?? []).map(
      ({ sort_order, ...rest }) => ({ ...rest, position: sort_order }),
    )

    return c.json({
      categories,
      items: itemsRes.data ?? [],
    })
  })

  // ── PATCH /tablet/inventory/items/:id ─────────────────────────────────────

  app.patch('/tablet/inventory/items/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('inventory:write')) {
      return c.json({ error: 'forbidden', required_permission: 'inventory:write' }, 403)
    }

    const itemId = c.req.param('id')
    const parsed = availabilitySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    // Scope check
    const { data: existing } = await admin
      .from('menu_items')
      .select('id, restaurant_id')
      .eq('id', itemId)
      .single()
    if (!existing) return c.json({ error: 'not_found' }, 404)
    if (existing.restaurant_id !== restaurantId) return c.json({ error: 'forbidden' }, 403)

    const { data, error } = await admin
      .from('menu_items')
      .update({
        availability_state: parsed.data.availability_state,
        restore_at: parsed.data.restore_at ?? null,
      })
      .eq('id', itemId)
      .select('id, name, availability_state, restore_at')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    // Invalidate menu KV and notify storefront
    const cache = new KvCache(c.env.MENU_CACHE)
    await cache.delete(buildKey('menu', restaurantId))

    deps.broadcaster?.broadcast(
      restaurantId,
      'menu_availability_changed',
      { item_id: itemId, availability_state: parsed.data.availability_state },
      {} as ExecutionContext,
    )

    return c.json(data)
  })

  // ── PATCH /tablet/inventory/categories/:id ─────────────────────────────────

  app.patch('/tablet/inventory/categories/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('inventory:write')) {
      return c.json({ error: 'forbidden', required_permission: 'inventory:write' }, 403)
    }

    const categoryId = c.req.param('id')
    const parsed = availabilitySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)

    const { data: existing } = await admin
      .from('menu_categories')
      .select('id, restaurant_id')
      .eq('id', categoryId)
      .single()
    if (!existing) return c.json({ error: 'not_found' }, 404)
    if (existing.restaurant_id !== restaurantId) return c.json({ error: 'forbidden' }, 403)

    const { data, error } = await admin
      .from('menu_categories')
      .update({
        availability_state: parsed.data.availability_state,
      })
      .eq('id', categoryId)
      .select('id, name, availability_state')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.MENU_CACHE)
    await cache.delete(buildKey('menu', restaurantId))

    deps.broadcaster?.broadcast(
      restaurantId,
      'menu_availability_changed',
      { category_id: categoryId, availability_state: parsed.data.availability_state },
      {} as ExecutionContext,
    )

    return c.json(data)
  })

  // ── PATCH /tablet/inventory/modifiers/options/:id ──────────────────────────

  app.patch('/tablet/inventory/modifiers/options/:id', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('inventory:write')) {
      return c.json({ error: 'forbidden', required_permission: 'inventory:write' }, 403)
    }

    const optionId = c.req.param('id')
    const body = await parseBody(c.req.raw) as Record<string, unknown> | null
    const available = typeof body?.available === 'boolean' ? body.available : null

    if (available === null) {
      return c.json({ error: 'invalid_request', message: 'available (boolean) is required' }, 422)
    }

    const admin = createAdminClient(c.env)

    // Scope check via modifier_groups → menu_items → restaurants
    const { data: option } = await admin
      .from('modifier_options')
      .select('id, group:modifier_groups(menu_item:menu_items(restaurant_id))')
      .eq('id', optionId)
      .single()

    if (!option) return c.json({ error: 'not_found' }, 404)

    const group = Array.isArray(option.group) ? option.group[0] : option.group
    const item = Array.isArray(group?.menu_item) ? group.menu_item[0] : group?.menu_item
    if (item?.restaurant_id !== restaurantId) return c.json({ error: 'forbidden' }, 403)

    const { data, error } = await admin
      .from('modifier_options')
      .update({ available, updated_at: new Date().toISOString() })
      .eq('id', optionId)
      .select('id, name, available')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.MENU_CACHE)
    await cache.delete(buildKey('menu', restaurantId))

    deps.broadcaster?.broadcast(
      restaurantId,
      'menu_availability_changed',
      { modifier_option_id: optionId, available },
      {} as ExecutionContext,
    )

    return c.json(data)
  })
}
