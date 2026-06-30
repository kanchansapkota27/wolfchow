import { z } from 'zod'
import type { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import { EncryptionService } from '../../services/encryption'
import { SmtpService, type EmailTransport } from '../../services/smtp'
import { requireRole } from '../../middleware/guards'

// ── Schemas ────────────────────────────────────────────────────────────────────

const saveSmtpSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(254),
  password: z.string().optional(),  // empty = keep existing encrypted_password
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

// ── Deps interface ─────────────────────────────────────────────────────────────

export interface SmtpTestCreds {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name: string
}

export interface SmtpRouteDeps {
  /** HTTP email transport factory — used for both connection test and saved-config test. */
  transport?: (env: Env) => EmailTransport
  /** Seal a plaintext SMTP password for storage. */
  sealSmtpPassword?: (plaintext: string, restaurantId: string) => Promise<string>
  /** Override the full test-connection flow (e.g. for unit tests). */
  testSmtpConnection?: (creds: SmtpTestCreds, to: string) => Promise<void>
  /** Override the saved-config test send (e.g. for unit tests). */
  sendTestEmail?: (restaurantId: string, to: string) => Promise<void>
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerSmtpRoutes(app: Hono<HonoEnv>, deps: SmtpRouteDeps = {}): void {
  // ── POST /admin/smtp ───────────────────────────────────────────────────────

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

    // Fetch admin's own email for the test send
    const { data: user } = await admin
      .from('users')
      .select('email')
      .eq('id', jwt.sub)
      .single()

    const adminEmail = (user as { email: string } | null)?.email
    if (!adminEmail) return c.json({ error: 'user_not_found' }, 404)

    // Resolve encrypted_password: use the new one if provided, else keep the existing one
    let encryptedPassword: string
    if (creds.password) {
      // Test the new credentials before saving
      const tester = deps.testSmtpConnection ?? makeConnectionTester(deps.transport?.(c.env))
      try {
        await tester({ ...creds, password: creds.password }, adminEmail)
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'connection_failed'
        return c.json({ error: 'smtp_connection_failed', detail }, 422)
      }

      encryptedPassword = deps.sealSmtpPassword
        ? await deps.sealSmtpPassword(creds.password, restaurantId)
        : await new EncryptionService(c.env.MASTER_ENCRYPTION_KEY).seal(creds.password, restaurantId)
    } else {
      // No new password — fetch the existing encrypted_password from DB
      const { data: existing } = await admin
        .from('smtp_config')
        .select('encrypted_password')
        .eq('restaurant_id', restaurantId)
        .maybeSingle()
      if (!existing) {
        return c.json({ error: 'invalid_request', detail: 'password required for new configuration' }, 422)
      }
      encryptedPassword = (existing as { encrypted_password: string }).encrypted_password
    }

    const { data, error } = await admin
      .from('smtp_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          host: creds.host,
          port: creds.port,
          username: creds.username,
          encrypted_password: encryptedPassword,
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

  // ── GET /admin/smtp ────────────────────────────────────────────────────────

  app.get('/admin/smtp', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)

    // Own config takes priority
    const { data: own } = await admin
      .from('smtp_config')
      .select('host, port, username, from_email, from_name, created_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (own) {
      const used = await monthlyUsed(c.env.SMTP_COUNTERS, restaurantId)
      return c.json({ ...(own as object), smtp_source: 'own', monthly_limit: null, monthly_used: used })
    }

    // Fall back to global (null restaurant_id)
    const { data: global } = await admin
      .from('smtp_config')
      .select('host, port, username, from_email, from_name, created_at')
      .is('restaurant_id', null)
      .maybeSingle()

    if (global) {
      const plan = await resolvePlan(c.env, restaurantId)
      const monthlyLimit = typeof plan?.smtp_monthly_limit === 'number' ? plan.smtp_monthly_limit : null
      const used = await monthlyUsed(c.env.SMTP_COUNTERS, restaurantId)
      return c.json({ ...(global as object), smtp_source: 'global', monthly_limit: monthlyLimit, monthly_used: used })
    }

    return c.json({ smtp_source: null, monthly_limit: null, monthly_used: 0 })
  })

  // ── DELETE /admin/smtp ─────────────────────────────────────────────────────

  app.delete('/admin/smtp', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('smtp_config')
      .delete()
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'delete_failed' }, 500)

    return c.body(null, 204)
  })

  // ── POST /admin/smtp/test ──────────────────────────────────────────────────

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

    // Optional custom recipient — falls back to the admin's own email
    const body = await parseBody(c.req.raw) as { to?: string } | null
    const toEmail = (typeof body?.to === 'string' && body.to.includes('@')) ? body.to : adminEmail

    const transport = deps.transport?.(c.env)
    const sender = deps.sendTestEmail ?? makeSavedConfigTester(c.env, transport)
    try {
      await sender(restaurantId, toEmail)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'send_failed'
      return c.json({ error: 'smtp_test_failed', detail }, 422)
    }

    return c.json({ sent_to: toEmail })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function monthlyUsed(kv: KVNamespace, restaurantId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 7)
  return Number.parseInt((await kv.get(`smtp:${restaurantId}:${month}`)) ?? '0', 10) || 0
}

/** Send a verification email using the credentials as-is (before they are saved). */
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

/** Send a test email using the restaurant's saved (decrypted) SMTP config. */
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
