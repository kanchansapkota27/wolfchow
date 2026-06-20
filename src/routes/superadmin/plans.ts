import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { KvCache } from '../../services/kv'
import { createPlanSchema, updatePlanSchema } from './schemas'

/** Columns returned for a plan (all of them — superadmin sees full detail). */
const PLAN_COLUMNS =
  'id, name, staff_cap, item_cap, category_cap, modifier_cap, smtp_monthly_limit, transaction_history_days, feature_flags, payment_methods_allowed, commission_type, is_public, created_at'

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/**
 * Superadmin plan CRUD. Mounted under the `/superadmin/*` guard stack (JWT →
 * platform role → MFA) from {@link registerSuperadminRoutes}, so these handlers
 * assume an authenticated superadmin/support caller. Uses the service-role admin
 * client (RLS bypass) since plans are platform-global, not tenant-scoped.
 */
export function registerPlanRoutes(app: Hono<HonoEnv>): void {
  app.get('/superadmin/plans', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('plans')
      .select(PLAN_COLUMNS)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) return c.json({ error: 'query_failed' }, 500)

    // Attach how many restaurants reference each plan so the UI can block
    // deletion of an in-use plan. One lightweight query (plan_id only), counted
    // in memory — avoids depending on PostgREST aggregate support.
    const usage = await admin.from('restaurants').select('plan_id')
    const counts = new Map<string, number>()
    for (const row of (usage.data ?? []) as Array<{ plan_id: string | null }>) {
      if (row.plan_id) counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1)
    }
    const plans = ((data ?? []) as Array<{ id: string }>).map((plan) => ({
      ...plan,
      restaurant_count: counts.get(plan.id) ?? 0,
    }))
    return c.json({ plans })
  })

  app.post('/superadmin/plans', async (c) => {
    const parsed = createPlanSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('plans')
      .insert(parsed.data)
      .select(PLAN_COLUMNS)
      .single()
    if (error || !data) return c.json({ error: 'insert_failed' }, 500)
    return c.json({ plan: data }, 201)
  })

  app.patch('/superadmin/plans/:id', async (c) => {
    const id = c.req.param('id')
    const parsed = updatePlanSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('plans')
      .update(parsed.data)
      .eq('id', id)
      .is('deleted_at', null)
      .select(PLAN_COLUMNS)
      .maybeSingle()
    if (error) return c.json({ error: 'update_failed' }, 500)
    if (!data) return c.json({ error: 'plan_not_found' }, 404)

    // Plan limits/flags are cached per restaurant as `plan:{restaurant_id}`.
    // Invalidate every restaurant on this plan so the next read repopulates.
    const restaurants = await admin.from('restaurants').select('id').eq('plan_id', id)
    const ids = (restaurants.data ?? []).map((r) => (r as { id: string }).id)
    if (ids.length > 0) {
      const cache = new KvCache(c.env.SETTINGS_CACHE)
      await Promise.all(ids.map((rid) => cache.invalidate(rid, 'plan')))
    }

    return c.json({ plan: data, invalidated: ids.length })
  })

  app.delete('/superadmin/plans/:id', async (c) => {
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)

    // Block deletion while any restaurant references the plan.
    const { count, error: countError } = await admin
      .from('restaurants')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
    if (countError) return c.json({ error: 'query_failed' }, 500)
    if ((count ?? 0) > 0) {
      return c.json({ error: 'plan_in_use', count: count ?? 0 }, 409)
    }

    const { data, error } = await admin
      .from('plans')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()
    if (error) return c.json({ error: 'delete_failed' }, 500)
    if (!data) return c.json({ error: 'plan_not_found' }, 404)
    return c.body(null, 204)
  })
}
