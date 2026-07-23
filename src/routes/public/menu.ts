import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache, KV_TTLS } from '../../services/kv'
import { resolvePlan } from '../../services/plan'

export interface PublicModifierOption {
  id: string
  name: string
  price_delta: number
  available: boolean
}

export interface PublicModifierGroup {
  id: string
  name: string
  type: 'single' | 'multi'
  required: boolean
  sort_order: number
  options: PublicModifierOption[]
}

export interface PublicVariant {
  id: string
  name: string
  price: number
  is_default: boolean
  sort_order: number
  available: boolean
}

export interface PublicMenuItem {
  id: string
  name: string
  description: string | null
  price: number
  availability_state: string
  image_url: string | null
  tags: string[]
  has_variants: boolean
  sort_order: number
  variants: PublicVariant[]
  modifier_groups: PublicModifierGroup[]
  special_requests_enabled: boolean
}

export interface PublicMenuCategory {
  id: string
  name: string
  sort_order: number
  items: PublicMenuItem[]
}

export interface PublicMenu {
  categories: PublicMenuCategory[]
}

export function registerPublicMenuRoutes(app: Hono<HonoEnv>): void {
  app.get('/public/:slug/menu', async (c) => {
    const slug = c.req.param('slug')
    if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) {
      return c.json({ error: 'invalid_slug' }, 400)
    }

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_PUBLIC.limit({ key: `pub:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const admin = createAdminClient(c.env)

    // Resolve restaurant by slug
    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id, slug, special_requests_enabled')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    const restaurantRow = restaurant as Record<string, unknown>
    const restaurantId = restaurantRow.id as string
    const specialRequestsDefault = restaurantRow.special_requests_enabled as boolean

    const menuCache = new KvCache(c.env.MENU_CACHE)
    const cacheKey = buildKey('menu', restaurantId)
    const cached = await menuCache.get<PublicMenu>(cacheKey)
    if (cached) return c.json(cached)

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    const showPhotos = flags?.menu_photos ?? false
    const showModifiers = flags?.item_modifiers ?? false

    const mediaBase = `${new URL(c.req.url).origin}/r2`

    // Load categories (active only)
    const { data: rawCats } = await admin
      .from('menu_categories')
      .select('id, name, sort_order, availability_state')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .order('sort_order', { ascending: true })

    const categories = rawCats ?? []
    if (categories.length === 0) return c.json({ categories: [] })

    const categoryIds = categories.map((c) => (c as Record<string, unknown>).id as string)

    // Load all items for these categories
    const { data: rawItems } = await admin
      .from('menu_items')
      .select('id, category_id, name, description, price, availability_state, image_r2_key, tags, has_variants, sort_order, special_requests_enabled')
      .in('category_id', categoryIds)
      .order('sort_order', { ascending: true })

    const items = (rawItems ?? []) as Record<string, unknown>[]
    const itemIds = items.map((i) => i.id as string)

    // Load variants for items that have them
    const variantsByItem = new Map<string, PublicVariant[]>()
    if (itemIds.length > 0) {
      const variantItemIds = items.filter((i) => i.has_variants as boolean).map((i) => i.id as string)
      if (variantItemIds.length > 0) {
        const { data: rawVariants } = await admin
          .from('item_variants')
          .select('id, item_id, name, price, is_default, sort_order, available')
          .in('item_id', variantItemIds)
          .order('sort_order', { ascending: true })

        for (const v of rawVariants ?? []) {
          const vr = v as Record<string, unknown>
          const itemId = vr.item_id as string
          if (!variantsByItem.has(itemId)) variantsByItem.set(itemId, [])
          variantsByItem.get(itemId)!.push({
            id: vr.id as string,
            name: vr.name as string,
            price: Number(vr.price) / 100,
            is_default: vr.is_default as boolean,
            sort_order: vr.sort_order as number,
            available: vr.available as boolean,
          })
        }
      }
    }

    // Load modifier groups and options (only if plan has item_modifiers)
    const modifiersByItem = new Map<string, PublicModifierGroup[]>()
    if (showModifiers && itemIds.length > 0) {
      // Per-item groups (modifier_groups.item_id is set)
      const { data: perItemGroups } = await admin
        .from('modifier_groups')
        .select('id, item_id, name, type, required, sort_order, availability_state, modifier_options(id, name, price_delta, available)')
        .in('item_id', itemIds)
        .eq('availability_state', 'available')
        .order('sort_order', { ascending: true })

      // Global groups assigned via junction table
      const { data: assignments } = await admin
        .from('item_modifier_groups')
        .select('item_id, modifier_group_id')
        .in('item_id', itemIds)

      const globalGroupIds = [...new Set((assignments ?? []).map((a) => {
        const ar = a as Record<string, unknown>
        return ar.modifier_group_id as string
      }))]

      let globalGroups: Record<string, unknown>[] = []
      if (globalGroupIds.length > 0) {
        const { data: rawGlobal } = await admin
          .from('modifier_groups')
          .select('id, item_id, name, type, required, sort_order, availability_state, modifier_options(id, name, price_delta, available)')
          .in('id', globalGroupIds)
          .eq('availability_state', 'available')
          .order('sort_order', { ascending: true })
        globalGroups = (rawGlobal ?? []) as Record<string, unknown>[]
      }

      // Build assignment map: item_id → Set<modifier_group_id>
      const assignmentMap = new Map<string, Set<string>>()
      for (const a of assignments ?? []) {
        const ar = a as Record<string, unknown>
        const itemId = ar.item_id as string
        const groupId = ar.modifier_group_id as string
        if (!assignmentMap.has(itemId)) assignmentMap.set(itemId, new Set())
        assignmentMap.get(itemId)!.add(groupId)
      }

      const globalGroupMap = new Map<string, Record<string, unknown>>(
        globalGroups.map((g) => [g.id as string, g])
      )

      const toPublicGroup = (g: Record<string, unknown>): PublicModifierGroup => ({
        id: g.id as string,
        name: g.name as string,
        type: g.type as 'single' | 'multi',
        required: g.required as boolean,
        sort_order: g.sort_order as number,
        options: ((g.modifier_options as Record<string, unknown>[] | null) ?? [])
          .filter((o) => o.available as boolean)
          .map((o) => ({
            id: o.id as string,
            name: o.name as string,
            price_delta: Number(o.price_delta) / 100,
            available: o.available as boolean,
          })),
      })

      for (const item of items) {
        const itemId = item.id as string
        const groups: PublicModifierGroup[] = []

        // Per-item groups
        for (const g of (perItemGroups ?? []) as Record<string, unknown>[]) {
          if (g.item_id === itemId) groups.push(toPublicGroup(g))
        }

        // Global groups via assignment
        const assignedGroupIds = assignmentMap.get(itemId) ?? new Set()
        for (const groupId of assignedGroupIds) {
          const g = globalGroupMap.get(groupId)
          if (g) groups.push(toPublicGroup(g))
        }

        groups.sort((a, b) => a.sort_order - b.sort_order)
        modifiersByItem.set(itemId, groups)
      }
    }

    // Group items by category
    const itemsByCategory = new Map<string, PublicMenuItem[]>()
    for (const item of items) {
      const catId = item.category_id as string
      if (!itemsByCategory.has(catId)) itemsByCategory.set(catId, [])

      const imageKey = item.image_r2_key as string | null
      itemsByCategory.get(catId)!.push({
        id: item.id as string,
        name: item.name as string,
        description: item.description as string | null,
        price: Number(item.price) / 100,
        availability_state: item.availability_state as string,
        image_url: showPhotos && imageKey ? `${mediaBase}/${imageKey}` : null,
        tags: (item.tags as string[] | null) ?? [],
        has_variants: item.has_variants as boolean,
        sort_order: item.sort_order as number,
        variants: variantsByItem.get(item.id as string) ?? [],
        modifier_groups: modifiersByItem.get(item.id as string) ?? [],
        special_requests_enabled: (item.special_requests_enabled as boolean | null) ?? specialRequestsDefault,
      })
    }

    const menu: PublicMenu = {
      categories: categories
        .map((cat) => {
          const cr = cat as Record<string, unknown>
          return {
            id: cr.id as string,
            name: cr.name as string,
            sort_order: cr.sort_order as number,
            items: itemsByCategory.get(cr.id as string) ?? [],
          }
        })
        .filter((cat) => cat.items.length > 0),
    }

    await menuCache.set(cacheKey, menu, KV_TTLS['menu'] ?? 300)
    return c.json(menu)
  })
}
