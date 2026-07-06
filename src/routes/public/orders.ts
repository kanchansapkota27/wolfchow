import { z } from 'zod'
import type { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { resolvePlan } from '../../services/plan'
import { getStripeClient } from '../../services/secrets'
import { KvCache, buildKey } from '../../services/kv'
import { RealtimeService } from '../../services/realtime'
import type { NotificationService, NotificationOrderItem } from '../../services/notifications'

// ── Schemas ─────────────────────────────────────────────────────────────────

const orderItemSchema = z.object({
  item_id: z.string().uuid(),
  variant_id: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(50),
  modifiers: z.array(z.object({
    group_id: z.string().uuid(),
    option_id: z.string().uuid(),
  })).optional().default([]),
  notes: z.string().max(500).optional(),
})

const PROMO_CODE_RE = /^[A-Z0-9_-]{1,50}$/

const createOrderSchema = z.object({
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().max(200),
  customer_phone: z.string().max(30).optional(),
  payment_method: z.enum(['card', 'pickup', 'delivery']),
  scheduled_for: z.string().datetime().optional(),
  items: z.array(orderItemSchema).min(1).max(50),
  promo_code: z.string().max(50).transform((v) => v.toUpperCase()).refine((v) => PROMO_CODE_RE.test(v), 'Invalid promo code format').optional(),
  promo_id: z.string().uuid().optional(),
  tip_amount: z.number().min(0).default(0),
  notes: z.string().max(1000).optional(),
  marketing_consent: z.boolean().default(false),
})

const confirmOrderSchema = z.object({
  payment_intent_id: z.string().min(1),
})

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

function generateTrackingToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `ord_live_${hex}`
}


// ── Deps ─────────────────────────────────────────────────────────────────────

export interface PublicOrderRouteDeps {
  notifier?: (env: Env) => NotificationService
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerPublicOrderRoutes(app: Hono<HonoEnv>, deps: PublicOrderRouteDeps = {}): void {
  // POST /public/:slug/orders — create a new order
  app.post('/public/:slug/orders', async (c) => {
    const slug = c.req.param('slug')

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_ORDER.limit({ key: `order:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const parsed = createOrderSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 422)
    }
    const input = parsed.data

    const admin = createAdminClient(c.env)

    const { data: restaurant } = await admin
      .from('restaurants')
      .select(`
        id, slug, currency, orders_paused, pause_reason,
        auto_accept, base_prep_minutes,
        tax_enabled, tax_rate, tax_inclusive
      `)
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    const r = restaurant as Record<string, unknown>
    const restaurantId = r.id as string

    if (r.orders_paused) {
      return c.json({ error: 'orders_paused', reason: r.pause_reason as string | null }, 503)
    }

    // Check plan: payment methods and features
    const plan = await resolvePlan(c.env, restaurantId)
    const flags = plan?.feature_flags as Record<string, boolean> | undefined
    const planPaymentMethods = plan?.payment_methods_allowed as string[] | null

    if (planPaymentMethods && !planPaymentMethods.includes(input.payment_method)) {
      return c.json({ error: 'payment_method_not_allowed' }, 402)
    }

    if (input.scheduled_for && !flags?.scheduled_orders_enabled) {
      return c.json({ error: 'feature_locked', feature: 'scheduled_orders_enabled' }, 402)
    }

    // Get restaurant's configured payment methods
    const { data: paymentConfig } = await admin
      .from('payment_config')
      .select('payment_methods_enabled, stripe_secret_vault_id')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    const configuredMethods = (paymentConfig as Record<string, unknown> | null)?.payment_methods_enabled as string[] ?? ['pickup']
    if (!configuredMethods.includes(input.payment_method)) {
      return c.json({ error: 'payment_method_not_configured' }, 422)
    }

    // Validate items and calculate subtotal from DB prices
    const itemIds = [...new Set(input.items.map((i) => i.item_id))]
    const variantIds = input.items.filter((i) => i.variant_id).map((i) => i.variant_id!)
    const modifierOptionIds = input.items.flatMap((i) => i.modifiers.map((m) => m.option_id))

    const { data: dbItems } = await admin
      .from('menu_items')
      .select('id, name, price, availability_state, has_variants, category_id')
      .in('id', itemIds)
      .eq('restaurant_id', restaurantId)

    if (!dbItems || dbItems.length !== itemIds.length) {
      return c.json({ error: 'item_not_found' }, 422)
    }

    const dbItemMap = new Map((dbItems as Record<string, unknown>[]).map((i) => [i.id as string, i]))

    // Check availability
    for (const item of dbItems as Record<string, unknown>[]) {
      if (item.availability_state === 'unavailable') {
        return c.json({ error: 'item_unavailable', item_id: item.id as string }, 422)
      }
    }

    let dbVariantMap = new Map<string, Record<string, unknown>>()
    if (variantIds.length > 0) {
      const { data: dbVariants } = await admin
        .from('item_variants')
        .select('id, item_id, name, price, available')
        .in('id', variantIds)
        .eq('restaurant_id', restaurantId)

      if (!dbVariants) return c.json({ error: 'variant_not_found' }, 422)
      dbVariantMap = new Map((dbVariants as Record<string, unknown>[]).map((v) => [v.id as string, v]))
    }

    // Load modifier options with their group's item scope so we can validate
    // that submitted modifiers actually belong to the ordered item (prevents
    // a customer from injecting a modifier from a different item to affect pricing).
    let dbModifierMap = new Map<string, Record<string, unknown>>()
    // itemId → Set<groupId> from global assignment table
    const itemGroupAssignments = new Map<string, Set<string>>()
    if (modifierOptionIds.length > 0) {
      const { data: dbOptions } = await admin
        .from('modifier_options')
        .select('id, group_id, name, price_delta, available, modifier_groups(id, item_id)')
        .in('id', modifierOptionIds)
        .eq('restaurant_id', restaurantId)

      if (dbOptions) {
        dbModifierMap = new Map((dbOptions as Record<string, unknown>[]).map((o) => [o.id as string, o]))
      }

      // Also load global group assignments for all items in this order
      if (itemIds.length > 0) {
        const { data: assignments } = await admin
          .from('item_modifier_groups')
          .select('item_id, modifier_group_id')
          .in('item_id', itemIds)
        for (const a of (assignments ?? []) as Record<string, unknown>[]) {
          const iid = a.item_id as string
          const gid = a.modifier_group_id as string
          if (!itemGroupAssignments.has(iid)) itemGroupAssignments.set(iid, new Set())
          itemGroupAssignments.get(iid)!.add(gid)
        }
      }
    }

    // Calculate subtotal and build order items
    let subtotal = 0
    const orderItemsToInsert: Record<string, unknown>[] = []

    for (const inputItem of input.items) {
      const dbItem = dbItemMap.get(inputItem.item_id)
      if (!dbItem) return c.json({ error: 'item_not_found', item_id: inputItem.item_id }, 422)

      let unitPrice: number
      let variantName: string | null = null

      if (inputItem.variant_id) {
        const dbVariant = dbVariantMap.get(inputItem.variant_id)
        if (!dbVariant || dbVariant.item_id !== inputItem.item_id) {
          return c.json({ error: 'variant_not_found', variant_id: inputItem.variant_id }, 422)
        }
        if (!dbVariant.available) {
          return c.json({ error: 'variant_unavailable', variant_id: inputItem.variant_id }, 422)
        }
        unitPrice = Number(dbVariant.price) / 100
        variantName = dbVariant.name as string
      } else {
        unitPrice = Number(dbItem.price) / 100
      }

      // Add modifier price deltas (with item-scoping check)
      const modifierSnapshots: Record<string, unknown>[] = []
      for (const mod of inputItem.modifiers) {
        const dbOption = dbModifierMap.get(mod.option_id)
        if (!dbOption) return c.json({ error: 'modifier_not_found', option_id: mod.option_id }, 422)
        if (!dbOption.available) {
          return c.json({ error: 'modifier_unavailable', option_id: mod.option_id }, 422)
        }

        // Verify this modifier group belongs to the item being ordered —
        // either as a per-item group (item_id = this item) or via global assignment.
        const group = (dbOption.modifier_groups as Record<string, unknown> | null)
        const groupId = dbOption.group_id as string
        const groupItemId = group?.item_id as string | null
        const assignedGroups = itemGroupAssignments.get(inputItem.item_id)
        const scopedToItem = (groupItemId === inputItem.item_id) || (assignedGroups?.has(groupId) ?? false)
        if (!scopedToItem) {
          return c.json({ error: 'modifier_not_applicable', option_id: mod.option_id }, 422)
        }

        const priceDelta = Number(dbOption.price_delta) / 100
        unitPrice += priceDelta
        modifierSnapshots.push({
          group_id: mod.group_id,
          option_id: mod.option_id,
          name: dbOption.name as string,
          price_delta: priceDelta,
        })
      }

      unitPrice = Math.max(0, unitPrice)
      subtotal += unitPrice * inputItem.quantity

      orderItemsToInsert.push({
        restaurant_id: restaurantId,
        item_id: inputItem.item_id,
        item_name: dbItem.name as string,
        variant_id: inputItem.variant_id ?? null,
        variant_name: variantName,
        quantity: inputItem.quantity,
        unit_price: unitPrice,
        modifiers: modifierSnapshots,
        notes: inputItem.notes ?? null,
      })
    }

    // Apply promotion
    let promoDiscount = 0
    let promoId: string | null = null
    let promoUsageLimit: number | null = null

    if (input.promo_id || input.promo_code) {
      let promoQuery = admin.from('promotions').select('id, discount_type, discount_value, minimum_order_amount, usage_limit, usage_count, start_time, end_time').eq('restaurant_id', restaurantId).eq('active', true)
      if (input.promo_id) {
        promoQuery = promoQuery.eq('id', input.promo_id)
      } else if (input.promo_code) {
        // exact match — input.promo_code is already uppercased by schema
        promoQuery = promoQuery.eq('promo_code', input.promo_code)
      }
      const { data: promos } = await promoQuery
      const promo = ((promos ?? []) as Record<string, unknown>[])[0]

      if (promo) {
        const now = new Date().toISOString()
        const start = promo.start_time as string | null
        const end = promo.end_time as string | null
        const limit = promo.usage_limit as number | null
        const count = promo.usage_count as number
        const minOrder = promo.minimum_order_amount as number | null

        if ((!start || start <= now) && (!end || end >= now) && (limit === null || count < limit) && (minOrder === null || subtotal >= minOrder)) {
          promoId = promo.id as string
          promoUsageLimit = limit
          const dtype = promo.discount_type as string
          const dvalue = promo.discount_value as number
          if (dtype === 'percentage') promoDiscount = Math.round((subtotal * dvalue) / 100 * 100) / 100
          else if (dtype === 'fixed') promoDiscount = Math.min(dvalue, subtotal)
        }
      }
    }

    const discountedSubtotal = Math.max(0, subtotal - promoDiscount)
    const tipAmount = Number(input.tip_amount ?? 0)

    // Tax calculation
    const taxEnabled = r.tax_enabled as boolean
    const taxRate = r.tax_rate as number
    const taxInclusive = r.tax_inclusive as boolean
    let taxAmount = 0
    if (taxEnabled) {
      if (taxInclusive) {
        taxAmount = Math.round(discountedSubtotal * taxRate / (100 + taxRate) * 100) / 100
      } else {
        taxAmount = Math.round(discountedSubtotal * taxRate / 100 * 100) / 100
      }
    }

    const total = taxInclusive
      ? discountedSubtotal + tipAmount
      : discountedSubtotal + taxAmount + tipAmount

    const totalCents = Math.round(total * 100)
    const currency = r.currency as string
    const trackingToken = generateTrackingToken()

    const isCardPayment = input.payment_method === 'card'
    const initialStatus = isCardPayment ? 'pending_payment' : 'auth_success'
    const initialPaymentStatus = isCardPayment ? 'pending' : 'captured'

    // For scheduled orders, check that scheduled_for is in the future
    if (input.scheduled_for) {
      const scheduledDate = new Date(input.scheduled_for)
      if (scheduledDate <= new Date()) {
        return c.json({ error: 'scheduled_for_must_be_future' }, 422)
      }
    }

    const orderInsert: Record<string, unknown> = {
      restaurant_id: restaurantId,
      tracking_token: trackingToken,
      status: initialStatus,
      payment_method: input.payment_method,
      payment_status: initialPaymentStatus,
      auto_accept: r.auto_accept as boolean,
      scheduled_for: input.scheduled_for ?? null,
      customer_name: input.customer_name,
      customer_email: input.customer_email,
      customer_phone: input.customer_phone ?? null,
      marketing_consent: input.marketing_consent,
      marketing_consent_at: input.marketing_consent ? new Date().toISOString() : null,
      tip_amount: tipAmount,
      promo_id: promoId,
      promo_discount: promoDiscount,
      subtotal,
      tax_amount: taxAmount,
      tax_rate: taxEnabled ? taxRate : 0,
      tax_inclusive: taxInclusive,
      total,
      notes: input.notes ?? null,
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert(orderInsert)
      .select('id, tracking_token')
      .single()

    if (orderError || !order) {
      return c.json({ error: 'order_create_failed' }, 500)
    }

    const or = order as Record<string, unknown>
    const orderId = or.id as string

    // Insert order items
    const itemsWithOrderId = orderItemsToInsert.map((item) => ({
      ...item,
      order_id: orderId,
    }))

    const { error: itemsError } = await admin.from('order_items').insert(itemsWithOrderId)
    if (itemsError) {
      await admin.from('orders').delete().eq('id', orderId)
      return c.json({ error: 'order_items_failed' }, 500)
    }

    // Atomic promo usage increment — rejects if the limit was reached by a concurrent request
    if (promoId) {
      const { data: incremented, error: rpcErr } = await admin
        .rpc('increment_promo_usage', { _promo_id: promoId, _max_usage: promoUsageLimit })
      if (rpcErr || incremented === false) {
        await admin.from('orders').delete().eq('id', orderId)
        return c.json({ error: 'promo_limit_reached' }, 409)
      }
    }

    // For card payments: create Stripe PaymentIntent
    let clientSecret: string | null = null
    if (isCardPayment) {
      try {
        const hasVaultId = Boolean((paymentConfig as Record<string, unknown> | null)?.stripe_secret_vault_id)
        if (!hasVaultId) {
          await admin.from('orders').delete().eq('id', orderId)
          return c.json({ error: 'stripe_not_configured' }, 503)
        }

        const stripeClient = await getStripeClient(restaurantId, c.env)
        if (!stripeClient) {
          await admin.from('orders').delete().eq('id', orderId)
          return c.json({ error: 'stripe_not_configured' }, 503)
        }

        const intent = await stripeClient.createPaymentIntent(totalCents, currency, restaurantId, orderId)
        clientSecret = intent.client_secret

        await admin.from('orders').update({ stripe_intent_id: intent.id }).eq('id', orderId)
      } catch {
        await admin.from('orders').delete().eq('id', orderId)
        return c.json({ error: 'payment_intent_failed' }, 502)
      }
    }

    // Invalidate menu cache (for promo usage count updates)
    const menuCache = new KvCache(c.env.MENU_CACHE)
    if (promoId) {
      await menuCache.delete(buildKey('menu', restaurantId)).catch(() => null)
    }

    // Notify tablet of new order (card orders broadcast after payment confirm instead)
    if (!isCardPayment) {
      const realtime = new RealtimeService(c.env)
      realtime.broadcast(restaurantId, 'new_order', { order_id: orderId }, c.executionCtx)
    }

    // Build notification items once — used for both confirmation and auto-accept emails
    const notifItems: NotificationOrderItem[] = orderItemsToInsert.map((item) => ({
      item_name: item.item_name as string | null,
      variant_name: item.variant_name as string | null,
      quantity: item.quantity as number,
      unit_price: item.unit_price as number,
      modifiers: (item.modifiers as Array<{ name: string; price_delta: number }>) ?? [],
      notes: item.notes as string | null,
    }))

    // Send confirmation email for non-card orders (already auth_success).
    // Card orders get their confirmation after /confirm succeeds.
    if (!isCardPayment && deps.notifier) {
      c.executionCtx.waitUntil(deps.notifier(c.env).sendOrderConfirmation(restaurantId, {
        id: orderId,
        tracking_token: trackingToken,
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        total,
        payment_method: input.payment_method,
        items: notifItems,
        notes: input.notes ?? null,
        scheduled_for: input.scheduled_for ?? null,
      }))
    }

    // Auto-accept pickup/delivery orders immediately when the restaurant has it enabled.
    // Card orders are handled in /confirm after Stripe authorization.
    if (!isCardPayment && (r.auto_accept as boolean)) {
      await admin
        .from('orders')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', orderId)

      const realtime = new RealtimeService(c.env)
      realtime.broadcast(restaurantId, 'order_accepted', { order_id: orderId }, c.executionCtx)

      if (deps.notifier) {
        c.executionCtx.waitUntil(deps.notifier(c.env).sendOrderAccepted(restaurantId, {
          id: orderId,
          tracking_token: trackingToken,
          customer_name: input.customer_name,
          customer_email: input.customer_email,
          total,
          payment_method: input.payment_method,
          items: notifItems,
          notes: input.notes ?? null,
          scheduled_for: input.scheduled_for ?? null,
        }))
      }
    }

    return c.json({
      order_id: orderId,
      tracking_token: trackingToken,
      client_secret: clientSecret,
      total,
      currency,
    }, 201)
  })

  // POST /public/:slug/orders/:order_id/confirm — confirm payment after Stripe.js
  app.post('/public/:slug/orders/:order_id/confirm', async (c) => {
    const slug = c.req.param('slug')
    const orderId = c.req.param('order_id')

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_ORDER.limit({ key: `confirm:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const parsed = confirmOrderSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 422)

    const admin = createAdminClient(c.env)

    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    const restaurantId = (restaurant as Record<string, unknown>).id as string

    const { data: order } = await admin
      .from('orders')
      .select('id, status, stripe_intent_id, total, tracking_token, customer_name, customer_email, payment_method, notes, scheduled_for, auto_accept')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()

    if (!order) return c.json({ error: 'order_not_found' }, 404)

    const or = order as Record<string, unknown>
    if (or.status !== 'pending_payment') {
      return c.json({ error: 'order_already_confirmed', status: or.status as string }, 409)
    }

    const stripeIntentId = or.stripe_intent_id as string | null
    if (!stripeIntentId || stripeIntentId !== parsed.data.payment_intent_id) {
      return c.json({ error: 'intent_mismatch' }, 422)
    }

    // Verify with Stripe that the intent is in requires_capture state
    const stripe = await getStripeClient(restaurantId, c.env)
    if (!stripe) return c.json({ error: 'stripe_not_configured' }, 503)

    try {
      const intent = await stripe.fetchPaymentIntentStatus(stripeIntentId)

      if (intent.status !== 'requires_capture') {
        return c.json({ error: 'payment_not_authorized', intent_status: intent.status }, 422)
      }

      const shouldAutoAccept = or.auto_accept as boolean

      if (shouldAutoAccept) {
        await stripe.capturePaymentIntent(stripeIntentId, `capture_${orderId}`)

        const { data: locked } = await admin.from('orders').update({
          status: 'accepted',
          payment_status: 'captured',
          stripe_amount_authorized: intent.amount,
          updated_at: new Date().toISOString(),
        }).eq('id', orderId).eq('status', 'pending_payment').select('id')

        if (!locked?.length) return c.json({ error: 'order_already_confirmed' }, 409)

        const realtime = new RealtimeService(c.env)
        realtime.broadcast(restaurantId, 'order_accepted', { order_id: orderId }, c.executionCtx)
      } else {
        const { data: locked } = await admin.from('orders').update({
          status: 'auth_success',
          payment_status: 'authorized',
          stripe_amount_authorized: intent.amount,
          accept_deadline_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        }).eq('id', orderId).eq('status', 'pending_payment').select('id')

        if (!locked?.length) return c.json({ error: 'order_already_confirmed' }, 409)
      }

      // Notify tablet — card orders broadcast here after payment is confirmed
      const realtimeConfirm = new RealtimeService(c.env)
      realtimeConfirm.broadcast(restaurantId, 'new_order', { order_id: orderId }, c.executionCtx)

      // Send confirmation email for card orders now that payment is authorised
      if (deps.notifier) {
        const notifier = deps.notifier(c.env)
        c.executionCtx.waitUntil(notifier.sendOrderConfirmation(restaurantId, {
          id: orderId,
          tracking_token: or.tracking_token as string,
          customer_name: or.customer_name as string,
          customer_email: or.customer_email as string,
          total: or.total as number,
          payment_method: or.payment_method as string,
          notes: (or.notes as string | null) ?? null,
          scheduled_for: (or.scheduled_for as string | null) ?? null,
        }))
      }

      return c.json({
        order_id: orderId,
        tracking_token: or.tracking_token as string,
        status: shouldAutoAccept ? 'accepted' : 'auth_success',
      })
    } catch {
      return c.json({ error: 'stripe_verification_failed' }, 502)
    }
  })
}
