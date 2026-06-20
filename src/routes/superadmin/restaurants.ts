import type { Context, Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { KvCache } from '../../services/kv'
import { RealtimeService, type Broadcaster } from '../../services/realtime'
import { createRestaurantDirectSchema, updateRestaurantSchema } from './schemas'

const PAGE_SIZE = 20
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Columns for the list view (joins plan name). */
const LIST_COLUMNS =
  'id, slug, display_name, plan_id, active, override_commission_type, override_commission_value, billing_note, created_at, plans(name)'

interface RestaurantListRow {
  id: string
  slug: string
  display_name: string
  plan_id: string | null
  active: boolean
  override_commission_type: string | null
  override_commission_value: number | null
  billing_note: string | null
  created_at: string
  plans: { name: string } | { name: string }[] | null
}

/** Dependencies, injectable for tests. */
export interface RestaurantRouteDeps {
  broadcaster?: (env: Env) => Broadcaster
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/** Hono's executionCtx getter throws when absent (e.g. in tests); fall back. */
function execCtx(c: Context<HonoEnv>): ExecutionContext {
  try {
    return c.executionCtx
  } catch {
    return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
  }
}

function planName(row: RestaurantListRow): string | null {
  return Array.isArray(row.plans) ? (row.plans[0]?.name ?? null) : (row.plans?.name ?? null)
}

/** Clear every restaurant-scoped cache key across all three cache namespaces. */
async function invalidateRestaurantKv(env: Env, restaurantId: string): Promise<void> {
  await Promise.all([
    new KvCache(env.MENU_CACHE).invalidateAll(restaurantId),
    new KvCache(env.FLAGS_CACHE).invalidateAll(restaurantId),
    new KvCache(env.SETTINGS_CACHE).invalidateAll(restaurantId),
  ])
}

/**
 * Superadmin restaurant management. Mounted under the `/superadmin/*` guard
 * stack (JWT → platform role → MFA). Uses the service-role admin client.
 */
export function registerRestaurantRoutes(app: Hono<HonoEnv>, deps: RestaurantRouteDeps = {}): void {
  const makeBroadcaster = deps.broadcaster ?? ((env: Env) => new RealtimeService(env))

  app.post('/superadmin/restaurants', async (c) => {
    const parsed = createRestaurantDirectSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json({ error: 'validation', issues: parsed.error.issues }, 422)

    const admin = createAdminClient(c.env)
    const address: Record<string, string> = {}
    if (parsed.data.country) address.country = parsed.data.country
    if (parsed.data.state) address.state = parsed.data.state

    const { data, error } = await admin
      .from('restaurants')
      .insert({
        slug: parsed.data.slug,
        business_name: parsed.data.business_name,
        display_name: parsed.data.display_name ?? parsed.data.business_name,
        timezone: parsed.data.timezone,
        currency: parsed.data.currency,
        address,
        plan_id: parsed.data.plan_id ?? null,
        override_commission_type: parsed.data.override_commission_type ?? null,
        override_commission_value: parsed.data.override_commission_value ?? null,
      })
      .select('id, slug, display_name, business_name, created_at')
      .single()

    if (error) {
      if (error.code === '23505') return c.json({ error: 'slug_taken' }, 409)
      return c.json({ error: 'insert_failed' }, 500)
    }
    return c.json({ restaurant: data }, 201)
  })

  app.get('/superadmin/restaurants', async (c) => {
    const admin = createAdminClient(c.env)
    const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)
    const search = c.req.query('search')
    const planId = c.req.query('plan_id')
    const active = c.req.query('active')

    let query = admin
      .from('restaurants')
      .select(LIST_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (search) query = query.or(`display_name.ilike.%${search}%,slug.ilike.%${search}%`)
    if (planId) query = query.eq('plan_id', planId)
    if (active === 'true' || active === 'false') query = query.eq('active', active === 'true')

    const { data, count, error } = await query
    if (error) return c.json({ error: 'query_failed' }, 500)

    const rows = data as RestaurantListRow[]
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
    const counts = await Promise.all(
      rows.map((r) =>
        admin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', r.id)
          .gte('created_at', cutoff)
          .then((res) => res.count ?? 0),
      ),
    )

    const restaurants = rows.map((r, i) => ({
      id: r.id,
      slug: r.slug,
      display_name: r.display_name,
      plan_id: r.plan_id,
      plan_name: planName(r),
      active: r.active,
      override_commission_type: r.override_commission_type,
      override_commission_value: r.override_commission_value,
      billing_note: r.billing_note,
      created_at: r.created_at,
      order_count_30d: counts[i] ?? 0,
    }))

    return c.json({ restaurants, page, page_size: PAGE_SIZE, total: count ?? 0 })
  })

  app.get('/superadmin/restaurants/:id', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('*, plans(name)')
      .eq('id', c.req.param('id'))
      .maybeSingle()
    if (error) return c.json({ error: 'query_failed' }, 500)
    if (!data) return c.json({ error: 'restaurant_not_found' }, 404)
    return c.json({ restaurant: data })
  })

  app.patch('/superadmin/restaurants/:id', async (c) => {
    const id = c.req.param('id')
    const parsed = updateRestaurantSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .update(parsed.data)
      .eq('id', id)
      .select('id, plan_id, override_commission_type, override_commission_value, billing_note, active')
      .maybeSingle()
    if (error) return c.json({ error: 'update_failed' }, 500)
    if (!data) return c.json({ error: 'restaurant_not_found' }, 404)

    // A plan change alters the tenant's cached limits/flags.
    if (parsed.data.plan_id !== undefined) {
      await new KvCache(c.env.SETTINGS_CACHE).invalidate(id, 'plan')
    }

    return c.json({ restaurant: data })
  })

  app.post('/superadmin/restaurants/:id/suspend', async (c) => {
    const id = c.req.param('id')
    const caller = c.get('jwt')
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('restaurants')
      .update({ active: false })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return c.json({ error: 'update_failed' }, 500)
    if (!data) return c.json({ error: 'restaurant_not_found' }, 404)

    // Tell live clients to stop, clear all caches, and audit.
    makeBroadcaster(c.env).broadcast(id, 'suspension', { restaurant_id: id }, execCtx(c))
    await invalidateRestaurantKv(c.env, id)
    await admin.from('audit_log').insert({
      restaurant_id: id,
      table_name: 'restaurants',
      operation: 'SUSPEND',
      user_id: caller.sub,
      new_data: { active: false },
    })

    return c.json({ id, active: false })
  })

  app.post('/superadmin/restaurants/:id/reactivate', async (c) => {
    const id = c.req.param('id')
    const caller = c.get('jwt')
    const admin = createAdminClient(c.env)

    const { data, error } = await admin
      .from('restaurants')
      .update({ active: true })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) return c.json({ error: 'update_failed' }, 500)
    if (!data) return c.json({ error: 'restaurant_not_found' }, 404)

    await admin.from('audit_log').insert({
      restaurant_id: id,
      table_name: 'restaurants',
      operation: 'REACTIVATE',
      user_id: caller.sub,
      new_data: { active: true },
    })

    return c.json({ id, active: true })
  })
}
