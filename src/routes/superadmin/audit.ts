import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

const PAGE_SIZE = 50

interface AuditRow {
  id: string
  restaurant_id: string | null
  table_name: string
  operation: string
  old_data: unknown
  new_data: unknown
  user_id: string | null
  created_at: string
}

/**
 * Shared query for both audit endpoints. `restaurantId` (from path or query)
 * pins the tenant; remaining filters come from the query string. Resolves
 * `user_name` from `users` in a single batched lookup (no FK embed needed, and
 * deleted users degrade gracefully to null).
 */
async function listAudit(c: Context<HonoEnv>, restaurantId?: string): Promise<Response> {
  const admin = createAdminClient(c.env)
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1)

  let query = admin
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  const rid = restaurantId ?? c.req.query('restaurant_id')
  if (rid) query = query.eq('restaurant_id', rid)

  const tableName = c.req.query('table_name')
  if (tableName) query = query.eq('table_name', tableName)
  const operation = c.req.query('operation')
  if (operation) query = query.eq('operation', operation)
  const dateFrom = c.req.query('date_from')
  if (dateFrom) query = query.gte('created_at', dateFrom)
  const dateTo = c.req.query('date_to')
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data, count, error } = await query
  if (error) return c.json({ error: 'query_failed' }, 500)

  const rows = (data ?? []) as AuditRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id).filter((v): v is string => Boolean(v)))]
  const names = new Map<string, string>()
  if (userIds.length > 0) {
    const users = await admin.from('users').select('id, name').in('id', userIds)
    for (const u of (users.data ?? []) as Array<{ id: string; name: string }>) {
      names.set(u.id, u.name)
    }
  }

  const entries = rows.map((r) => ({
    ...r,
    user_name: r.user_id ? (names.get(r.user_id) ?? null) : null,
  }))
  return c.json({ entries, page, page_size: PAGE_SIZE, total: count ?? 0 })
}

/**
 * Superadmin platform audit log. Mounted under the `/superadmin/*` guard stack
 * (JWT → platform role → MFA). Read-only, cross-tenant (service-role client).
 */
export function registerAuditRoutes(app: Hono<HonoEnv>): void {
  app.get('/superadmin/audit', (c) => listAudit(c))
  app.get('/superadmin/audit/:restaurant_id', (c) => listAudit(c, c.req.param('restaurant_id')))
}
