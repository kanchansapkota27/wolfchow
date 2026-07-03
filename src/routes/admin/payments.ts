import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache } from '../../services/kv'
import { resolvePlan } from '../../services/plan'
import { EncryptionService } from '../../services/encryption'
import { requireRole } from '../../middleware/guards'

// ── Schemas ────────────────────────────────────────────────────────────────────

const saveStripeKeySchema = z.object({
  secret_key: z.string().regex(/^sk_(live|test)_/, 'Must start with sk_live_ or sk_test_'),
  publishable_key: z.string().regex(/^pk_(live|test)_/, 'Must start with pk_live_ or pk_test_'),
})

const patchMethodsSchema = z.object({
  payment_methods: z.array(z.string()).min(1),
})

const patchNoteSchema = z.object({
  pickup_delivery_note: z.string().max(500).nullable(),
})

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Deps interface (injectable for testing) ────────────────────────────────────

export interface PaymentRouteDeps {
  verifyStripeKey?: (secretKey: string) => Promise<boolean>
  sealStripeKey?: (plaintext: string, restaurantId: string) => Promise<string>
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerPaymentRoutes(app: Hono<HonoEnv>, deps: PaymentRouteDeps = {}): void {
  const verifyStripeKey = deps.verifyStripeKey ?? defaultVerifyStripeKey

  // ── POST /admin/payments/stripe ────────────────────────────────────────────

  app.post('/admin/payments/stripe', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = saveStripeKeySchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const { secret_key, publishable_key } = parsed.data

    const valid = await verifyStripeKey(secret_key)
    if (!valid) {
      return c.json({ error: 'invalid_stripe_key', code: 'stripe_rejected' }, 422)
    }

    const encryptedSecret = deps.sealStripeKey
      ? await deps.sealStripeKey(secret_key, restaurantId)
      : await new EncryptionService(c.env.MASTER_ENCRYPTION_KEY).seal(secret_key, restaurantId)

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('payment_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          encrypted_stripe_secret: encryptedSecret,
          stripe_publishable_key: publishable_key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' },
      )
      .select('stripe_publishable_key, updated_at')
      .single()

    if (error || !data) return c.json({ error: 'save_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    return c.json({ publishable_key: data.stripe_publishable_key, has_secret: true, updated_at: data.updated_at })
  })

  // ── GET /admin/payments/stripe ─────────────────────────────────────────────

  app.get('/admin/payments/stripe', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('payment_config')
      .select('stripe_publishable_key, encrypted_stripe_secret, updated_at')
      .eq('restaurant_id', restaurantId)
      .single()

    if (error || !data) {
      return c.json({ publishable_key: null, has_secret: false, updated_at: null })
    }

    return c.json({
      publishable_key: data.stripe_publishable_key,
      has_secret: data.encrypted_stripe_secret !== null,
      updated_at: data.updated_at,
    })
  })

  // ── DELETE /admin/payments/stripe ──────────────────────────────────────────

  app.delete('/admin/payments/stripe', requireRole('restaurant_owner'), async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { error } = await admin
      .from('payment_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          encrypted_stripe_secret: null,
          stripe_publishable_key: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' },
      )

    if (error) return c.json({ error: 'delete_failed' }, 500)

    const cache = new KvCache(c.env.SETTINGS_CACHE)
    await cache.delete(buildKey('settings', restaurantId))

    return c.body(null, 204)
  })

  // ── GET /admin/payments/methods ───────────────────────────────────────────

  app.get('/admin/payments/methods', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const admin = createAdminClient(c.env)
    const { data } = await admin
      .from('payment_config')
      .select('payment_methods_enabled, pickup_delivery_note')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    return c.json({
      payment_methods: (data as Record<string, unknown> | null)?.payment_methods_enabled ?? [],
      pickup_delivery_note: (data as Record<string, unknown> | null)?.pickup_delivery_note ?? null,
    })
  })

  // ── PATCH /admin/payments/methods ──────────────────────────────────────────

  app.patch('/admin/payments/methods', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = patchMethodsSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const { payment_methods } = parsed.data

    const plan = await resolvePlan(c.env, restaurantId)
    const allowed = Array.isArray(plan?.payment_methods_allowed) ? plan.payment_methods_allowed as string[] : null

    if (allowed !== null) {
      const disallowed = payment_methods.filter((m) => !allowed.includes(m))
      if (disallowed.length > 0) {
        return c.json({ error: 'plan_limit_reached', disallowed, allowed }, 402)
      }
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('payment_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          payment_methods_enabled: payment_methods,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' },
      )
      .select('payment_methods_enabled, pickup_delivery_note')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const settingsCache = new KvCache(c.env.SETTINGS_CACHE)
    await settingsCache.delete(buildKey('settings', `widget:${restaurantId}`))

    const d = data as Record<string, unknown>
    return c.json({ payment_methods: d.payment_methods_enabled, pickup_delivery_note: d.pickup_delivery_note ?? null })
  })

  // ── PATCH /admin/payments/note ─────────────────────────────────────────────

  app.patch('/admin/payments/note', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const parsed = patchNoteSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('payment_config')
      .upsert(
        {
          restaurant_id: restaurantId,
          pickup_delivery_note: parsed.data.pickup_delivery_note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id' },
      )
      .select('pickup_delivery_note')
      .single()

    if (error || !data) return c.json({ error: 'update_failed' }, 500)

    const settingsCache = new KvCache(c.env.SETTINGS_CACHE)
    await settingsCache.delete(buildKey('settings', `widget:${restaurantId}`))

    return c.json(data)
  })
}

// ── Default Stripe key verifier ────────────────────────────────────────────────

async function defaultVerifyStripeKey(secretKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    return res.ok
  } catch {
    return false
  }
}
