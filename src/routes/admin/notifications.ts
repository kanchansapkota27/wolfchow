import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv, Env } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import type { NotificationService } from '../../services/notifications'
import { VaultError } from '../../services/secrets'

// ── Constants ──────────────────────────────────────────────────────────────────

const ALL_STATUSES = [
  'pending_payment',
  'scheduled',
  'auth_success',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'rejected',
  'missed',
  'refunded',
] as const

type TriggerStatus = (typeof ALL_STATUSES)[number]

/** Statuses where customer notification is mandatory and cannot be disabled. */
const MANDATORY_CUSTOMER_STATUSES = new Set<TriggerStatus>(['rejected', 'missed', 'refunded'])

/** Default send_customer for each status when no config row exists. */
const DEFAULT_SEND_CUSTOMER: Record<TriggerStatus, boolean> = {
  pending_payment: false,
  scheduled: true,
  auth_success: true,
  accepted: true,
  preparing: false,
  ready: true,
  completed: false,
  rejected: true,
  missed: true,
  refunded: true,
}

// ── Schemas ────────────────────────────────────────────────────────────────────

const notificationConfigSchema = z.object({
  trigger_status: z.enum(ALL_STATUSES),
  send_customer: z.boolean(),
  internal_recipients: z.array(z.string().email()).default([]),
  template_override: z.string().nullable().optional(),
})

const putNotificationsSchema = z.array(notificationConfigSchema).min(1)

async function parseBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

// ── Deps ───────────────────────────────────────────────────────────────────────

export interface NotificationRouteDeps {
  /** Send preview email for status to recipient. */
  sendPreviewEmail?: (restaurantId: string, status: TriggerStatus, to: string) => Promise<void>
  /** NotificationService factory — used to send real preview emails in production. */
  notifier?: (env: Env) => NotificationService
}

// ── Routes ─────────────────────────────────────────────────────────────────────

export function registerNotificationRoutes(app: Hono<HonoEnv>, deps: NotificationRouteDeps = {}): void {
  // ── GET /admin/notifications ───────────────────────────────────────────────

  app.get('/admin/notifications', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('notification_config')
      .select('trigger_status, send_customer, internal_recipients, template_override')
      .eq('restaurant_id', restaurantId)

    if (error) return c.json({ error: 'fetch_failed' }, 500)

    const savedMap = new Map(((data ?? []) as { trigger_status: string }[]).map((r) => [r.trigger_status, r]))

    const configs = ALL_STATUSES.map((status) => {
      const saved = savedMap.get(status)
      if (saved) return saved
      return {
        trigger_status: status,
        send_customer: DEFAULT_SEND_CUSTOMER[status],
        internal_recipients: [],
        template_override: null,
      }
    })

    return c.json({ notifications: configs })
  })

  // ── PUT /admin/notifications ───────────────────────────────────────────────

  app.put('/admin/notifications', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!

    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    if (!flags?.email_notifications) {
      return c.json({ error: 'feature_locked', feature: 'email_notifications' }, 402)
    }

    const parsed = putNotificationsSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', code: 'validation', issues: parsed.error.issues }, 422)
    }

    // Enforce non-configurable statuses — customer must always be notified
    for (const config of parsed.data) {
      if (MANDATORY_CUSTOMER_STATUSES.has(config.trigger_status) && !config.send_customer) {
        return c.json(
          { error: 'customer_notification_required', trigger_status: config.trigger_status },
          422,
        )
      }
    }

    const rows = parsed.data.map((cfg) => ({
      restaurant_id: restaurantId,
      trigger_status: cfg.trigger_status,
      send_customer: cfg.send_customer,
      internal_recipients: cfg.internal_recipients,
      template_override: cfg.template_override ?? null,
    }))

    const admin = createAdminClient(c.env)
    const { data, error } = await admin
      .from('notification_config')
      .upsert(rows, { onConflict: 'restaurant_id,trigger_status' })
      .select('trigger_status, send_customer, internal_recipients, template_override')

    if (error) return c.json({ error: 'save_failed' }, 500)

    return c.json({ notifications: data ?? [] })
  })

  // ── POST /admin/notifications/preview/:status ──────────────────────────────

  app.post('/admin/notifications/preview/:status', async (c) => {
    const jwt = c.get('jwt')
    const restaurantId = jwt.restaurant_id!
    const status = c.req.param('status') as TriggerStatus

    if (!(ALL_STATUSES as readonly string[]).includes(status)) {
      return c.json({ error: 'invalid_status' }, 422)
    }

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

    const sender: (rId: string, st: TriggerStatus, to: string) => Promise<void> =
      deps.sendPreviewEmail ??
      (deps.notifier
        ? (rId, st, to) => deps.notifier!(c.env).sendPreview(rId, st, to)
        : defaultSendPreviewEmail)

    try {
      await sender(restaurantId, status, adminEmail)
    } catch (err) {
      if (err instanceof VaultError) {
        console.error('[notifications/preview] vault error', err)
        return c.json({ error: 'preview_failed', detail: 'configuration_error' }, 422)
      }
      const detail = err instanceof Error ? err.message : 'send_failed'
      return c.json({ error: 'preview_failed', detail }, 422)
    }

    return c.json({ sent_to: adminEmail, status })
  })
}

async function defaultSendPreviewEmail(_restaurantId: string, _status: TriggerStatus, _to: string): Promise<void> {
  // Real implementation requires NotificationService (STORY-NEW-E) and transport (STORY-039).
  throw new Error('notification service not configured')
}
