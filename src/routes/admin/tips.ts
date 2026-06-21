import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'

// ── Schemas ────────────────────────────────────────────────────────────────────

const patchTipsSchema = z
  .object({
    tips_enabled: z.boolean().optional(),
    tip_presets: z.array(z.number().int().min(0).max(100)).max(6).optional(),
    allow_custom_tip: z.boolean().optional(),
    show_no_tip: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tips_enabled === true && data.allow_custom_tip === false && data.show_no_tip === false) {
      ctx.addIssue({
        code: 'custom',
        message: 'If tips enabled, at least one of allow_custom_tip or show_no_tip must be true',
        path: [],
      })
    }
  })

const patchTaxSchema = z
  .object({
    tax_enabled: z.boolean().optional(),
    tax_rate: z.number().min(0).max(100).optional(),
    tax_inclusive: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tax_enabled === true && data.tax_rate !== undefined && data.tax_rate <= 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'tax_rate must be positive when tax is enabled',
        path: ['tax_rate'],
      })
    }
  })

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerTipsRoutes(app: Hono<HonoEnv>): void {
  // ── GET /admin/tips ────────────────────────────────────────────────────────

  app.get('/admin/tips', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('tips_enabled, tip_presets, allow_custom_tip, show_no_tip')
      .eq('id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

  // ── PATCH /admin/tips ──────────────────────────────────────────────────────

  app.patch('/admin/tips', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = patchTipsSchema.safeParse(await parseBody(c.req.raw))
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
      .select('tips_enabled, tip_presets, allow_custom_tip, show_no_tip')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    return c.json(data)
  })

  // ── GET /admin/tax ─────────────────────────────────────────────────────────

  app.get('/admin/tax', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!
    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('restaurants')
      .select('tax_enabled, tax_rate, tax_inclusive')
      .eq('id', restaurantId)
      .single()

    if (error || !data) return c.json({ error: 'not_found' }, 404)
    return c.json(data)
  })

  // ── PATCH /admin/tax ───────────────────────────────────────────────────────

  app.patch('/admin/tax', async (c) => {
    const restaurantId = c.get('jwt').restaurant_id!

    const parsed = patchTaxSchema.safeParse(await parseBody(c.req.raw))
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
      .select('tax_enabled, tax_rate, tax_inclusive')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    return c.json(data)
  })
}
