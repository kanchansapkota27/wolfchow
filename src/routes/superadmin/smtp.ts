import type { Context, Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { SecretsService } from '../../services/secrets'
import { NoSmtpConfigError, SmtpService, type EmailTransport } from '../../services/smtp'
import { smtpGlobalSchema, smtpOverrideSchema } from './schemas'

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
  password_vault_id: string | null
}

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

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
    has_password: Boolean(row.password_vault_id),
  }
}

async function readMonthlyCount(env: Env, restaurantId: string): Promise<number> {
  const period = new Date().toISOString().slice(0, 7)
  try {
    const stub = env.TENANT_COUNTER.get(env.TENANT_COUNTER.idFromName(restaurantId))
    const res = await stub.fetch(
      `https://do/read?counter=smtp&period=${period}`,
      { method: 'GET' },
    )
    const body = await res.json() as { count: number }
    return body.count ?? 0
  } catch {
    return 0
  }
}

export function registerSmtpRoutes(app: Hono<HonoEnv>, deps: SmtpRouteDeps = {}): void {
  app.post('/superadmin/smtp/global', async (c) => {
    const parsed = smtpGlobalSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json({ error: 'validation', issues: parsed.error.issues }, 422)

    const admin = createAdminClient(c.env)
    const secrets = new SecretsService(c.env)

    // Find existing global row (NULLs not unique — can't use upsert)
    const existing = await admin
      .from('smtp_config')
      .select('id, password_vault_id')
      .is('restaurant_id', null)
      .limit(1)
      .maybeSingle()
    const existingRow = existing.data as { id: string; password_vault_id: string | null } | null

    let passwordVaultId: string
    if (existingRow?.password_vault_id) {
      await secrets.rotate(existingRow.password_vault_id, parsed.data.password)
      passwordVaultId = existingRow.password_vault_id
    } else {
      // Guard against orphaned vault entries: if the smtp_config row was deleted
      // but the vault entry was not, rotating the existing secret avoids a unique
      // constraint error on the name column.
      const orphanedId = await secrets.findByName('smtp:global')
      if (orphanedId) {
        await secrets.rotate(orphanedId, parsed.data.password)
        passwordVaultId = orphanedId
      } else {
        passwordVaultId = await secrets.put('smtp:global', parsed.data.password)
      }
    }

    const fields = {
      host: parsed.data.host,
      port: parsed.data.port,
      username: parsed.data.username,
      password_vault_id: passwordVaultId,
      from_email: parsed.data.from_email,
      from_name: parsed.data.from_name,
    }

    if (existingRow) {
      const upd = await admin.from('smtp_config').update(fields).eq('id', existingRow.id)
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
    const callerEmail = (user.data as { email: string } | null)?.email
    if (!callerEmail) return c.json({ error: 'caller_email_not_found' }, 400)

    const body = await readJson(c) as { to?: string } | null
    const toEmail = (typeof body?.to === 'string' && body.to.includes('@')) ? body.to : callerEmail

    const transport = deps.transport?.(c.env)
    const svc = transport ? new SmtpService(c.env, transport) : new SmtpService(c.env)
    try {
      await svc.sendGlobalTest(toEmail, 'RestroAPI SMTP test', '<p>Your global SMTP configuration works.</p>')
    } catch (err) {
      if (err instanceof NoSmtpConfigError) return c.json({ error: 'no_global_config' }, 400)
      const detail = err instanceof Error ? err.message : 'send_failed'
      return c.json({ error: 'send_failed', detail }, 422)
    }
    return c.json({ ok: true, sent_to: toEmail })
  })

  app.post('/superadmin/smtp/restaurants/:id', async (c) => {
    const restaurantId = c.req.param('id')
    const parsed = smtpOverrideSchema.safeParse(await readJson(c))
    if (!parsed.success) return c.json({ error: 'validation', issues: parsed.error.issues }, 422)

    const admin = createAdminClient(c.env)
    const secrets = new SecretsService(c.env)

    const existing = await admin
      .from('smtp_config')
      .select('password_vault_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    const existingVaultId = (existing.data as { password_vault_id: string | null } | null)?.password_vault_id

    let passwordVaultId: string
    if (existingVaultId) {
      await secrets.rotate(existingVaultId, parsed.data.password)
      passwordVaultId = existingVaultId
    } else {
      const orphanedId = await secrets.findByName(`smtp:${restaurantId}`)
      if (orphanedId) {
        await secrets.rotate(orphanedId, parsed.data.password)
        passwordVaultId = orphanedId
      } else {
        passwordVaultId = await secrets.put(`smtp:${restaurantId}`, parsed.data.password)
      }
    }

    const { error } = await admin.from('smtp_config').upsert(
      {
        restaurant_id: restaurantId,
        host: parsed.data.host,
        port: parsed.data.port,
        username: parsed.data.username,
        password_vault_id: passwordVaultId,
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

    const monthly_used = await readMonthlyCount(c.env, restaurantId)
    return c.json({ config: { ...publicConfig(data as SmtpConfigRow), monthly_used } })
  })

  app.get('/superadmin/smtp/overrides', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('smtp_config')
      .select('*, restaurants(display_name)')
      .not('restaurant_id', 'is', null)
    if (error) return c.json({ error: 'list_failed' }, 500)

    type OverrideRow = SmtpConfigRow & {
      restaurants: { display_name: string } | { display_name: string }[] | null
    }
    const rows = (data ?? []) as OverrideRow[]
    const overrides = await Promise.all(
      rows.map(async (row) => {
        const monthly_used = await readMonthlyCount(c.env, row.restaurant_id!)
        const restaurant_name = Array.isArray(row.restaurants)
          ? (row.restaurants[0]?.display_name ?? null)
          : (row.restaurants?.display_name ?? null)
        return { ...publicConfig(row), monthly_used, restaurant_name }
      }),
    )
    return c.json({ overrides })
  })

  app.delete('/superadmin/smtp/restaurants/:id', async (c) => {
    const restaurantId = c.req.param('id')
    const admin = createAdminClient(c.env)

    const existing = await admin
      .from('smtp_config')
      .select('password_vault_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    const vaultId = (existing.data as { password_vault_id: string | null } | null)?.password_vault_id

    const { error } = await admin.from('smtp_config').delete().eq('restaurant_id', restaurantId)
    if (error) return c.json({ error: 'delete_failed' }, 500)

    if (vaultId) {
      await new SecretsService(c.env).delete(vaultId).catch(() => {})
    }

    return c.body(null, 204)
  })
}
