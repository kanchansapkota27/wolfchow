import type { Env } from '../types'
import { createAdminClient } from './supabase'
import { buildKey, KvCache } from './kv'
import { RealtimeService } from './realtime'
import { getStripeClient } from './secrets'
import type { NotificationService } from './notifications'

// ── Inventory restore ─────────────────────────────────────────────────────────

export async function runInventoryRestore(env: Env, ctx: ExecutionContext): Promise<void> {
  const admin = createAdminClient(env)
  const now = new Date().toISOString()

  const { data: items } = await admin
    .from('menu_items')
    .select('id, restaurant_id')
    .not('restore_at', 'is', null)
    .lte('restore_at', now)
    .neq('availability_state', 'available')

  if (!items?.length) return

  const ids = (items as Array<{ id: string; restaurant_id: string }>).map((i) => i.id)

  await admin
    .from('menu_items')
    .update({ availability_state: 'available', restore_at: null })
    .in('id', ids)

  const restaurantIds = [...new Set(
    (items as Array<{ id: string; restaurant_id: string }>).map((i) => i.restaurant_id),
  )]

  const cache = new KvCache(env.MENU_CACHE)
  const realtime = new RealtimeService(env)

  await Promise.all(
    restaurantIds.map((rid) => cache.delete(buildKey('menu', rid))),
  )

  for (const item of items as Array<{ id: string; restaurant_id: string }>) {
    realtime.broadcast(item.restaurant_id, 'menu_availability_changed', {
      item_id: item.id,
      availability_state: 'available',
    }, ctx)
  }
}

// ── Auto-reject ───────────────────────────────────────────────────────────────

export async function runAutoReject(env: Env, ctx: ExecutionContext): Promise<void> {
  const admin = createAdminClient(env)
  const now = new Date()

  const { data: restaurants } = await admin
    .from('restaurants')
    .select('id, auto_reject_minutes')
    .eq('auto_reject_enabled', true)
    .not('auto_reject_minutes', 'is', null)

  if (!restaurants?.length) return

  const realtime = new RealtimeService(env)

  for (const row of restaurants as Array<{ id: string; auto_reject_minutes: number }>) {
    const restaurantId = row.id
    const cutoff = new Date(now.getTime() - row.auto_reject_minutes * 60_000).toISOString()

    const { data: orders } = await admin
      .from('orders')
      .select('id, payment_method, stripe_intent_id')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'auth_success')
      .lte('created_at', cutoff)
      // Exempt scheduled orders whose slot hasn't arrived yet — created_at is
      // not a meaningful "staff should have acted by now" signal for an order
      // placed hours/days ahead of its pickup time. Once scheduled_for passes,
      // the normal created_at cutoff applies again.
      .or(`scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`)

    if (!orders?.length) continue

    const cardOrders = (orders as Array<{
      id: string
      payment_method: string
      stripe_intent_id: string | null
    }>).filter((o) => o.payment_method === 'card' && o.stripe_intent_id)

    if (cardOrders.length > 0) {
      try {
        const stripe = await getStripeClient(restaurantId, env)
        if (stripe) {
          await Promise.allSettled(
            cardOrders.map((o) =>
              stripe.cancelPaymentIntent(o.stripe_intent_id!, `auto_reject_${o.id}`),
            ),
          )
        }
      } catch {
        // If we can't get the Stripe key, still reject the DB rows
      }
    }

    const orderIds = (orders as Array<{ id: string }>).map((o) => o.id)

    await admin
      .from('orders')
      .update({ status: 'rejected', updated_at: now.toISOString() })
      .in('id', orderIds)

    for (const orderId of orderIds) {
      realtime.broadcast(restaurantId, 'order_rejected', { order_id: orderId }, ctx)
    }
  }
}

// ── Device-offline owner alert ──────────────────────────────────────────────

const DEVICE_OFFLINE_THRESHOLD_MS = 2 * 60_000

/**
 * Runs every minute (same cron trigger as the rest of this file). For every
 * restaurant that has at least one non-revoked device, checks whether ANY of
 * them has heartbeated within the last 2 minutes. If none have, and the
 * restaurant hasn't already been alerted for this outage
 * (`device_offline_alert_sent_at`), emails the owner once. The flag is
 * cleared as soon as any device reports back online, so the next outage
 * triggers a fresh alert instead of staying silent forever.
 *
 * Restaurants with zero devices ever configured are intentionally not
 * alerted here — that's a setup/onboarding state, not an outage.
 */
export async function runDeviceOfflineAlert(env: Env, notifier: (env: Env) => NotificationService): Promise<void> {
  const admin = createAdminClient(env)
  const now = Date.now()

  const { data: devices } = await admin
    .from('devices')
    .select('restaurant_id, last_seen_at')
    .is('revoked_at', null)

  if (!devices?.length) return

  const anyOnlineByRestaurant = new Map<string, boolean>()
  for (const d of devices as Array<{ restaurant_id: string; last_seen_at: string | null }>) {
    const online = d.last_seen_at !== null && now - new Date(d.last_seen_at).getTime() < DEVICE_OFFLINE_THRESHOLD_MS
    anyOnlineByRestaurant.set(d.restaurant_id, (anyOnlineByRestaurant.get(d.restaurant_id) ?? false) || online)
  }

  for (const [restaurantId, anyOnline] of anyOnlineByRestaurant) {
    const { data: restaurant } = await admin
      .from('restaurants')
      .select('display_name, device_offline_alert_sent_at')
      .eq('id', restaurantId)
      .maybeSingle()
    if (!restaurant) continue
    const r = restaurant as { display_name: string; device_offline_alert_sent_at: string | null }

    if (anyOnline) {
      if (r.device_offline_alert_sent_at) {
        await admin.from('restaurants').update({ device_offline_alert_sent_at: null }).eq('id', restaurantId)
      }
      continue
    }

    // All devices offline — but don't re-alert if we already have for this outage.
    if (r.device_offline_alert_sent_at) continue

    const { data: owner } = await admin
      .from('users')
      .select('email')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'restaurant_owner')
      .eq('active', true)
      .maybeSingle()
    const ownerEmail = (owner as { email: string } | null)?.email
    if (!ownerEmail) continue

    await notifier(env).sendDeviceOfflineAlert(restaurantId, r.display_name, ownerEmail)
    await admin.from('restaurants').update({ device_offline_alert_sent_at: new Date().toISOString() }).eq('id', restaurantId)
  }
}
