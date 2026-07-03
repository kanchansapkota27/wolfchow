import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

const patchAutomationSchema = z.object({
  auto_accept: z.boolean().optional(),
  auto_reject_enabled: z.boolean().optional(),
  auto_reject_minutes: z.number().int().min(2).max(15).optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export function registerAutomationRoutes(app: Hono<HonoEnv>): void {
  app.get('/admin/orders/automation', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('auto_accept, auto_reject_enabled, auto_reject_minutes')
      .eq('id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

  app.patch('/admin/orders/automation', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = patchAutomationSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    if (Object.keys(parsed.data).length === 0) {
      return c.json({ error: 'no_updatable_fields' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .update(parsed.data)
      .eq('id', restaurantId)
      .select('auto_accept, auto_reject_enabled, auto_reject_minutes')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    return c.json(data)
  })
}
