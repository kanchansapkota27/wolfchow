import type { Context, Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { z } from 'zod'

const updateSettingsSchema = z
  .object({
    jwt_expiry_minutes: z.number().int().min(5).max(10080),
    global_rate_limit: z.number().int().min(1),
    maintenance_mode: z.boolean(),
    support_email: z.string().email().max(255),
    r2_public_domain: z.string().max(255),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'at least one field required' })

async function readJson(c: Context<HonoEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/**
 * Platform settings (singleton row). Mounted under the `/superadmin/*` guard
 * stack (JWT → platform role → MFA).
 */
export function registerSettingsRoutes(app: Hono<HonoEnv>): void {
  app.get('/superadmin/settings', async (c) => {
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .single()
    if (error || !data) return c.json({ error: 'settings_not_found' }, 404)
    return c.json({ settings: data })
  })

  app.patch('/superadmin/settings', async (c) => {
    const parsed = updateSettingsSchema.safeParse(await readJson(c))
    if (!parsed.success) {
      return c.json({ error: 'validation', issues: parsed.error.issues }, 422)
    }
    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('platform_settings')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) return c.json({ error: 'update_failed' }, 500)
    return c.json({ ok: true })
  })

  app.post('/superadmin/settings/webhook-secret', async (c) => {
    const secret = generateSecret()
    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('platform_settings')
      .update({ webhook_signing_secret: secret, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) return c.json({ error: 'update_failed' }, 500)
    return c.json({ webhook_signing_secret: secret })
  })
}
