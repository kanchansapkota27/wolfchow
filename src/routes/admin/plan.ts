import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'

export function registerAdminPlanRoutes(app: Hono<HonoEnv>): void {
  app.get('/admin/plan', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)

    const [plan, usageCounts, platformSettings] = await Promise.all([
      resolvePlan(c.env, restaurantId),

      // Parallel count queries for usage
      Promise.all([
        admin
          .from('menu_categories')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('active', true)
          .then((r) => r.count ?? 0),
        admin
          .from('menu_items')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .eq('active', true)
          .then((r) => r.count ?? 0),
        admin
          .from('devices')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .is('revoked_at', null)
          .then((r) => r.count ?? 0),
        // Global modifier groups only (item_id IS NULL)
        admin
          .from('modifier_groups')
          .select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId)
          .is('item_id', null)
          .then((r) => r.count ?? 0),
      ]),

      // Platform upgrade message from platform_settings
      admin
        .from('platform_settings')
        .select('upgrade_message_title, upgrade_message_html')
        .eq('id', 1)
        .maybeSingle()
        .then((r) => r.data),
    ])

    if (!plan) {
      return c.json({ error: 'no_plan' }, 404)
    }

    const [categories, items, devices, modifiers] = usageCounts

    const ps = platformSettings as { upgrade_message_title?: string; upgrade_message_html?: string } | null

    return c.json({
      plan,
      usage: { categories, items, devices, modifiers },
      upgrade_message: {
        title: ps?.upgrade_message_title ?? 'Upgrade your plan',
        html: ps?.upgrade_message_html ?? '<p>Contact your administrator to upgrade.</p>',
      },
    })
  })
}
