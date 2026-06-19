import type { Context, Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { EncryptionService } from '../../services/encryption'
import { NoSmtpConfigError, SmtpService, type EmailTransport } from '../../services/smtp'
import { smtpGlobalSchema, smtpOverrideSchema } from './schemas'

/** Dependencies, injectable for tests (e.g. a recording email transport). */
export interface SmtpRouteDeps {
  transport?: (env: Env) => EmailTransport
}

interface SmtpConfigRow {
  id: string
  restaurant_id: string | null
  host: string
  port: number
  username: string
  from_email: string
  from_name: string
  monthly_limit: number | null
  encrypted_password: string
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/** Strip the secret before returning a config row. */
function publicConfig(row: SmtpConfigRow): Record<string, unknown> {
  return {
    id: row.id,
    restaurant_id: row.restaurant_id,
    host: row.host,
    port: row.port,
    username: row.username,
    from_email: row.from_email,
    from_name: row.from_name,
    monthly_limit: row.monthly_limit,
    has_password: Boolean(row.encrypted_password),
  }
}

/**
 * Superadmin SMTP management. Mounted under the `/superadmin/*` guard stack
 * (JWT → platform role → MFA). Passwords are sealed with `EncryptionService`
 * (context `global` or the restaurant_id) and never returned.
 */
export function registerSmtpRoutes(app: Hono<HonoEnv>, deps: SmtpRouteDeps = {}): void {
  app.post('/superadmin/smtp/global', async (c) => {
    const parsed = smtpGlobalSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json({ error: 'validation', issues: parsed.error.issues }, 422)

    const admin = createAdminClient(c.env)
    const encryption = new EncryptionService(c.env.MASTER_ENCRYPTION_KEY)
    const encrypted = await encryption.seal(parsed.data.password, 'global')
    const fields = {
      host: parsed.data.host,
      port: parsed.data.port,
      username: parsed.data.username,
      encrypted_password: encrypted,
      from_email: parsed.data.from_email,
      from_name: parsed.data.from_name,
    }

    // UNIQUE(restaurant_id) treats NULLs as distinct, so upsert can't dedupe the
    // global row — find-or-update by hand.
    const existing = await admin
      .from('smtp_config')
      .select('id')
      .is('restaurant_id', null)
      .limit(1)
      .maybeSingle()
    if (existing.data) {
      const upd = await admin.from('smtp_config').update(fields).eq('id', (existing.data as { id: string }).id)
      if (upd.error) return c.json({ error: 'save_failed' }, 500)
    } else {
      const ins = await admin.from('smtp_config').insert({ restaurant_id: null, ...fields })
      if (ins.error) return c.json({ error: 'save_failed' }, 500)
    }
    return c.json({ ok: true }, 201)
  })

  app.get('/superadmin/smtp/global', async (c) => {
    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('smtp_config')
      .select('*')
      .is('restaurant_id', null)
      .limit(1)
      .maybeSingle()
    if (!data) return c.json({ error: 'no_global_config' }, 404)
    return c.json({ config: publicConfig(data as SmtpConfigRow) })
  })

  app.post('/superadmin/smtp/test', async (c) => {
    const caller = c.get('jwt')
    const admin = createAdminClient(c.env)
    const user = await admin.from('users').select('email').eq('id', caller.sub).maybeSingle()
    const email = (user.data as { email: string } | null)?.email
    if (!email) return c.json({ error: 'caller_email_not_found' }, 400)

    const transport = deps.transport?.(c.env)
    const svc = transport ? new SmtpService(c.env, transport) : new SmtpService(c.env)
    try {
      await svc.sendGlobalTest(email, 'RestroAPI SMTP test', '<p>Your global SMTP configuration works.</p>')
    } catch (err) {
      if (err instanceof NoSmtpConfigError) return c.json({ error: 'no_global_config' }, 400)
      return c.json({ error: 'email_transport_not_configured' }, 503)
    }
    return c.json({ ok: true, sent_to: email })
  })

  app.post('/superadmin/smtp/restaurants/:id', async (c) => {
    const restaurantId = c.req.param('id')
    const parsed = smtpOverrideSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json({ error: 'validation', issues: parsed.error.issues }, 422)

    const admin = createAdminClient(c.env)
    const encryption = new EncryptionService(c.env.MASTER_ENCRYPTION_KEY)
    const encrypted = await encryption.seal(parsed.data.password, restaurantId)
    const { error } = await admin.from('smtp_config').upsert(
      {
        restaurant_id: restaurantId,
        host: parsed.data.host,
        port: parsed.data.port,
        username: parsed.data.username,
        encrypted_password: encrypted,
        from_email: parsed.data.from_email,
        from_name: parsed.data.from_name,
        monthly_limit: parsed.data.monthly_limit ?? null,
      },
      { onConflict: 'restaurant_id' },
    )
    if (error) return c.json({ error: 'save_failed' }, 500)
    return c.json({ ok: true }, 201)
  })

  app.get('/superadmin/smtp/restaurants/:id', async (c) => {
    const restaurantId = c.req.param('id')
    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('smtp_config')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (!data) return c.json({ error: 'no_override' }, 404)

    const month = new Date().toISOString().slice(0, 7)
    const raw = await c.env.SMTP_COUNTERS.get(`smtp:${restaurantId}:${month}`)
    const monthly_used = Number.parseInt(raw ?? '0', 10) || 0
    return c.json({ config: { ...publicConfig(data as SmtpConfigRow), monthly_used } })
  })

  app.get('/superadmin/smtp/overrides', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('smtp_config')
      .select('*, restaurants(display_name)')
      .not('restaurant_id', 'is', null)
    if (error) return c.json({ error: 'list_failed' }, 500)

    const month = new Date().toISOString().slice(0, 7)
    type OverrideRow = SmtpConfigRow & {
      restaurants: { display_name: string } | { display_name: string }[] | null
    }
    const rows = (data ?? []) as OverrideRow[]
    const overrides = await Promise.all(
      rows.map(async (row) => {
        const raw = await c.env.SMTP_COUNTERS.get(`smtp:${row.restaurant_id!}:${month}`)
        const monthly_used = Number.parseInt(raw ?? '0', 10) || 0
        const restaurant_name = Array.isArray(row.restaurants)
          ? (row.restaurants[0]?.display_name ?? null)
          : (row.restaurants?.display_name ?? null)
        return { ...publicConfig(row), monthly_used, restaurant_name }
      }),
    )
    return c.json({ overrides })
  })

  app.delete('/superadmin/smtp/restaurants/:id', async (c) => {
    const admin = createAdminClient(c.env)
    const { error } = await admin.from('smtp_config').delete().eq('restaurant_id', c.req.param('id'))
    if (error) return c.json({ error: 'delete_failed' }, 500)
    return c.body(null, 204)
  })
}
