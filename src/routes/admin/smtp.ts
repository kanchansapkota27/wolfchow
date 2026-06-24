import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import { EncryptionService } from '../../services/encryption'
import { requireRole } from '../../middleware/guards'

// ── Schemas ────────────────────────────────────────────────────────────────────

const saveSmtpSchema = z.object({
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(254),
  password: z.string().min(1),
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
  /** Test SMTP credentials by sending to `to`. Throw to signal failure. */
  testSmtpConnection?: (creds: SmtpTestCreds, to: string) => Promise<void>
  /** Seal a plaintext SMTP password for storage. */
  sealSmtpPassword?: (plaintext: string, restaurantId: string) => Promise<string>
  /** Send a test email using the restaurant's currently-saved SMTP config. */
  sendTestEmail?: (restaurantId: string, to: string) => Promise<void>
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerSmtpRoutes(app: Hono<HonoEnv>, deps: SmtpRouteDeps = {}): void {
  // ── POST /admin/smtp ───────────────────────────────────────────────────────

  app.post('/admin/smtp', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

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

    // Test the credentials before saving
    const tester = deps.testSmtpConnection ?? defaultTestSmtpConnection
    try {
      await tester(creds, adminEmail)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'connection_failed'
      return c.json({ error: 'smtp_connection_failed', detail }, 422)
    }

    // Encrypt the password (injectable for tests to avoid needing MASTER_ENCRYPTION_KEY)
    const encryptedPassword = deps.sealSmtpPassword
      ? await deps.sealSmtpPassword(creds.password, restaurantId)
      : await new EncryptionService(c.env.MASTER_ENCRYPTION_KEY).seal(creds.password, restaurantId)

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
      .select('host, port, username, from_email, from_name, updated_at')
      .single()

    if (error || !data) return c.json({ error: 'save_failed' }, 500)

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
      .select('host, port, username, from_email, from_name, updated_at')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (own) {
      const used = await monthlyUsed(c.env.SMTP_COUNTERS, restaurantId)
      return c.json({ ...(own as object), smtp_source: 'own', monthly_limit: null, monthly_used: used })
    }

    // Fall back to global (null restaurant_id)
    const { data: global } = await admin
      .from('smtp_config')
      .select('host, port, username, from_email, from_name, updated_at')
      .is('restaurant_id', null)
      .maybeSingle()

    if (global) {
      const cache = new KvCache(c.env.SETTINGS_CACHE)
      const plan = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
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

    const admin = createAdminClient(c.env)
    const { data: user } = await admin
      .from('users')
      .select('email')
      .eq('id', jwt.sub)
      .single()

    const adminEmail = (user as { email: string } | null)?.email
    if (!adminEmail) return c.json({ error: 'user_not_found' }, 404)

    const sender = deps.sendTestEmail ?? defaultSendTestEmail
    try {
      await sender(restaurantId, adminEmail)
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'send_failed'
      return c.json({ error: 'smtp_test_failed', detail }, 422)
    }

    return c.json({ sent_to: adminEmail })
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function monthlyUsed(kv: KVNamespace, restaurantId: string): Promise<number> {
  const month = new Date().toISOString().slice(0, 7)
  return Number.parseInt((await kv.get(`smtp:${restaurantId}:${month}`)) ?? '0', 10) || 0
}

// Real implementation requires an email transport (STORY-039). Until then, no-op.
async function defaultTestSmtpConnection(_creds: SmtpTestCreds, _to: string): Promise<void> {}

async function defaultSendTestEmail(_restaurantId: string, _to: string): Promise<void> {
  throw new Error('email transport not configured')
}
