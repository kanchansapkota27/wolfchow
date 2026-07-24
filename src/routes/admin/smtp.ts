import { z } from 'zod'
import type { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import { SecretsService, VaultError } from '../../services/secrets'
import { SmtpService, type EmailTransport } from '../../services/smtp'
import { requireRole } from '../../middleware/guards'

const saveSmtpSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(254),
  password: z.string().optional(),
  from_email: z.string().email(),
  from_name: z.string().min(1).max(100),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export interface SmtpTestCreds {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name: string
}

export interface SmtpRouteDeps {
  transport?: (env: Env) => EmailTransport
  /** Store a new SMTP password in Vault; returns the vault_id uuid. */
  putSmtpPassword?: (plaintext: string, name: string) => Promise<string>
  testSmtpConnection?: (creds: SmtpTestCreds, to: string) => Promise<void>
  sendTestEmail?: (restaurantId: string, to: string) => Promise<void>
}

export function registerSmtpRoutes(app: Hono<HonoEnv>, deps: SmtpRouteDeps = {}): void {
  app.post('/admin/smtp', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const parsed = saveSmtpSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const creds = parsed.data
    const admin = createAdminClient(c.env)

    const { data: user } = await admin
      .from('users')
      .select('email')
      .eq('id', jwt.sub)
      .single()

    const adminEmail = (user as { email: string } | null)?.email
    if (!adminEmail) return c.json({ error: 'user_not_found' }, 404)

    // Fetch existing row to know if we rotate or put
    const { data: existing } = await admin
      .from('smtp_config')
      .select('password_vault_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    const existingVaultId = (existing as { password_vault_id: string | null } | null)?.password_vault_id

    let passwordVaultId: string
    if (creds.password) {
      const tester = deps.testSmtpConnection ?? makeConnectionTester(deps.transport?.(c.env))
      try {
        await tester({ ...creds, password: creds.password }, adminEmail)
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'connection_failed'
        return c.json({ error: 'smtp_connection_failed', detail }, 422)
      }

      const secretName = `smtp:${restaurantId}`
      if (deps.putSmtpPassword) {
        passwordVaultId = await deps.putSmtpPassword(creds.password, secretName)
      } else {
        const secrets = new SecretsService(c.env)
        if (existingVaultId) {
          await secrets.rotate(existingVaultId, creds.password)
          passwordVaultId = existingVaultId
        } else {
          passwordVaultId = await secrets.put(secretName, creds.password)
        }
      }
    } else {
      if (!existingVaultId) {
        return c.json({ error: 'invalid_request', detail: 'password required for new configuration' }, 422)
      }
      passwordVaultId = existingVaultId
    }

    const { data, error } = await admin
      .from('smtp_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          host: creds.host,
          port: creds.port,
          username: creds.username,
          password_vault_id: passwordVaultId,
          from_email: creds.from_email,
          from_name: creds.from_name,
        },
        { onConflict: 'restaurant_id' },
      )
      .select('host, port, username, from_email, from_name, created_at')
      .single()

    if (error || !data) return c.json({ error: 'save_failed', detail: error?.message }, 500)

    return c.json({ ...(data as object), smtp_source: 'own', monthly_limit: null }, 201)
  })

  app.get('/admin/smtp', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)

    const { data: own } = await admin
      .from('smtp_config')
      .select('host, port, username, from_email, from_name, created_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (own) {
      const used = await readMonthlyCount(c.env, restaurantId)
      return c.json({ ...(own as object), smtp_source: 'own', monthly_limit: null, monthly_used: used })
    }

    const { data: global } = await admin
      .from('smtp_config')
      .select('host, port, username, from_email, from_name, created_at')
      .is('restaurant_id', null)
      .maybeSingle()

    if (global) {
      const plan = await resolvePlan(c.env, restaurantId)
      const monthlyLimit = typeof plan?.smtp_monthly_limit === 'number' ? plan.smtp_monthly_limit : null
      const used = await readMonthlyCount(c.env, restaurantId)
      return c.json({ ...(global as object), smtp_source: 'global', monthly_limit: monthlyLimit, monthly_used: used })
    }

    return c.json({ smtp_source: null, monthly_limit: null, monthly_used: 0 })
  })

  app.delete('/admin/smtp', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const admin = createAdminClient(c.env)

    // Fetch vault_id before deleting so we can clean up the vault secret
    const { data: existing } = await admin
      .from('smtp_config')
      .select('password_vault_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    const vaultId = (existing as { password_vault_id: string | null } | null)?.password_vault_id

    const { error } = await admin
      .from('smtp_config')
      .delete()
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'delete_failed' }, 500)

    if (vaultId) {
      await new SecretsService(c.env).delete(vaultId).catch(() => {})
    }

    return c.body(null, 204)
  })

  app.post('/admin/smtp/test', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { data: user } = await admin
      .from('users')
      .select('email')
      .eq('id', jwt.sub)
      .single()

    const adminEmail = (user as { email: string } | null)?.email
    if (!adminEmail) return c.json({ error: 'user_not_found' }, 404)

    const body = await parseBody(c.req.raw) as { to?: string } | null
    const toRaw = typeof body?.to === 'string' ? body.to.trim() : ''
    const toEmail = z.string().email().safeParse(toRaw).success ? toRaw : adminEmail

    const transport = deps.transport?.(c.env)
    const sender = deps.sendTestEmail ?? makeSavedConfigTester(c.env, transport)
    try {
      await sender(restaurantId, toEmail)
    } catch (err) {
      if (err instanceof VaultError) {
        console.error('[smtp/test] vault error', err)
        return c.json({ error: 'smtp_test_failed', detail: 'configuration_error' }, 422)
      }
      const detail = err instanceof Error ? err.message : 'send_failed'
      return c.json({ error: 'smtp_test_failed', detail }, 422)
    }

    return c.json({ sent_to: toEmail })
  })
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

function makeConnectionTester(
  transport: EmailTransport | undefined,
): (creds: SmtpTestCreds, to: string) => Promise<void> {
  return async (creds, to) => {
    if (!transport) throw new Error('email transport not configured')
    await transport.send({
      credentials: creds,
      to,
      subject: 'RestroAPI SMTP Connection Test',
      html: '<p>Your email provider is connected and working.</p>',
    })
  }
}

function makeSavedConfigTester(
  env: Env,
  transport: EmailTransport | undefined,
): (restaurantId: string, to: string) => Promise<void> {
  return async (restaurantId, to) => {
    if (!transport) throw new Error('email transport not configured')
    const svc = new SmtpService(env, transport)
    await svc.send({
      restaurant_id: restaurantId,
      to,
      subject: 'RestroAPI SMTP Test',
      html: '<p>Your email configuration is working correctly.</p>',
    })
  }
}
