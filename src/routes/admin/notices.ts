import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import type { Broadcaster } from '../../services/realtime'

const createNoticeSchema = z.object({
  type: z.enum(['informational', 'warning', 'emergency', 'promotional']),
  message: z.string().min(1).max(200),
  display_locations: z.array(z.enum(['storefront', 'checkout', 'tracking', 'tablet', 'admin'])).min(1),
  priority: z.number().int().min(0).max(100).default(0),
  starts_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
})

const patchNoticeSchema = z.object({
  type: z.enum(['informational', 'warning', 'emergency', 'promotional']).optional(),
  message: z.string().min(1).max(200).optional(),
  display_locations: z.array(z.enum(['storefront', 'checkout', 'tracking', 'tablet', 'admin'])).min(1).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  starts_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
})

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export interface NoticesRouteDeps {
  broadcaster?: Broadcaster
}

export function registerNoticesRoutes(app: Hono<HonoEnv>, deps: NoticesRouteDeps = {}): void {
  app.get('/admin/notices', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('notices')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('priority', { ascending: false })

    if (error) return c.json({ error: 'fetch_failed' }, 500)
    return c.json({ notices: data ?? [] })
  })

  app.post('/admin/notices', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = createNoticeSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('notices')
      .insert({ ...parsed.data, restaurant_id: restaurantId })
      .select()
      .single()

    if (error || !data) return c.json({ error: 'create_failed' }, 500)

    deps.broadcaster?.broadcast(restaurantId, 'notice_created', data, {} as ExecutionContext)
    return c.json(data, 201)
  })

  app.patch('/admin/notices/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')

    const parsed = patchNoticeSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('notices')
      .update(parsed.data)
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .select()
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)

    deps.broadcaster?.broadcast(restaurantId, 'notice_created', data, {} as ExecutionContext)
    return c.json(data)
  })

  app.delete('/admin/notices/:id', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const id = c.req.param('id')
    const admin = createAdminClient(c.env)

    const { data: existing } = await admin
      .from('notices')
      .select('id')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single()

    if (!existing) return c.json({ error: 'not_found' }, 404)

    await admin.from('notices').delete().eq('id', id).eq('restaurant_id', restaurantId)

    deps.broadcaster?.broadcast(restaurantId, 'notice_removed', { id }, {} as ExecutionContext)
    return c.body(null, 204)
  })
}
