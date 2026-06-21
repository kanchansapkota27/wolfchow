import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import type { Broadcaster } from '../../services/realtime'

const VALID_TRANSITIONS: Record<string, string[]> = {
  accepted: ['preparing'],
  preparing: ['ready'],
  ready: ['completed'],
}

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface StatusRouteDeps {
  broadcaster?: Broadcaster
}

export function registerStatusRoutes(app: Hono<HonoEnv>, deps: StatusRouteDeps = {}): void {
  // ── POST /tablet/orders/:id/status ─────────────────────────────────────────

  app.post('/tablet/orders/:id/status', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    if (!jwt.permissions.includes('orders:status')) {
      return c.json({ error: 'forbidden', required_permission: 'orders:status' }, 403)
    }

    const orderId = c.req.param('id')
    const body = await parseBody(c.req.raw) as Record<string, unknown> | null
    const newStatus = typeof body?.status === 'string' ? body.status : null

    if (!newStatus) {
      return c.json({ error: 'invalid_request', message: 'status is required' }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data: order, error: fetchErr } = await admin
      .from('orders')
      .select('id, status, restaurant_id')
      .eq('id', orderId)
      .single()

    if (fetchErr || !order) return c.json({ error: 'not_found' }, 404)
    if (order.restaurant_id !== restaurantId) return c.json({ error: 'forbidden' }, 403)

    const allowed = VALID_TRANSITIONS[order.status] ?? []
    if (!allowed.includes(newStatus)) {
      return c.json({
        error: 'invalid_transition',
        current: order.status,
        allowed,
      }, 422)
    }

    const { data: updated, error: updateErr } = await admin
      .from('orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select('*, items:order_items(*, modifiers:order_item_modifiers(*))')
      .single()

    if (updateErr || !updated) return c.json({ error: 'update_failed' }, 500)

    deps.broadcaster?.broadcast(
      restaurantId,
      'order_status_changed',
      { order_id: orderId, previous_status: order.status, new_status: newStatus },
      {} as ExecutionContext,
    )

    return c.json(updated)
  })
}
