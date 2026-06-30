import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'
import { buildKey, KvCache, KV_TTLS } from '../../services/kv'

export interface WidgetSettings {
  slug: string
  display_name: string
  logo_url: string | null
  brand_colors: { primary: string; secondary: string; accent: string; text: string } | null
  font_family: string | null
  currency: string
  timezone: string
  payment_methods: string[]
  stripe_publishable_key: string | null
  pickup_delivery_note: string | null
  tips: {
    enabled: boolean
    presets: number[]
    allow_custom: boolean
    show_no_tip: boolean
  }
  tax: { enabled: boolean; rate: number; inclusive: boolean }
  orders_paused: boolean
  pause_reason: string | null
  features: {
    menu_photos: boolean
    item_modifiers: boolean
    promotions_enabled: boolean
    scheduled_orders_enabled: boolean
    order_tracking_page: boolean
    remove_powered_by: boolean
    custom_brand_color: boolean
  }
  /** Null when the plan does not include scheduled orders. */
  scheduling: {
    enabled: true
    base_prep_minutes: number
    interval_minutes: number
  } | null
  notices: Array<{
    id: string
    type: string
    message: string
    display_locations: string[]
    priority: number
  }>
  media_base_url: string
}

export function registerPublicSettingsRoutes(app: Hono<HonoEnv>): void {
  app.get('/public/:slug/settings', async (c) => {
    const slug = c.req.param('slug')
    if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) {
      return c.json({ error: 'invalid_slug' }, 400)
    }

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_PUBLIC.limit({ key: `pub:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const admin = createAdminClient(c.env)

    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select(`
        id, slug, display_name, logo_r2_key, brand_colors, currency, timezone,
        plan_id,
        tips_enabled, tip_presets, allow_custom_tip, show_no_tip,
        tax_enabled, tax_rate, tax_inclusive,
        orders_paused, pause_reason,
        base_prep_minutes, scheduling_interval
      `)
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (restaurantError) return c.json({ error: 'db_error', detail: restaurantError.message }, 500)
    if (!restaurant) return c.json({ error: 'restaurant_not_found' }, 404)

    // Cache key uses restaurant ID so admin invalidations (which know the ID,
    // not the slug) correctly bust this cache.
    const settingsCache = new KvCache(c.env.SETTINGS_CACHE)
    const cacheKey = buildKey('settings', restaurant.id as string)
    const cached = await settingsCache.get<WidgetSettings>(cacheKey)
    if (cached) return c.json(cached)

    // Fetch plan separately to avoid PostgREST join ambiguity on nullable FK
    const r = restaurant as Record<string, unknown>
    const planId = r.plan_id as string | null
    let plan: Record<string, unknown> | null = null
    if (planId) {
      const { data: planData } = await admin
        .from('plans')
        .select('feature_flags, payment_methods_allowed')
        .eq('id', planId)
        .maybeSingle()
      plan = planData as Record<string, unknown> | null
    }

    const flags = plan?.feature_flags as Record<string, boolean> | null
    const planPaymentMethods = plan?.payment_methods_allowed as string[] | null

    const { data: paymentConfig } = await admin
      .from('payment_config')
      .select('stripe_publishable_key, payment_methods_enabled, pickup_delivery_note')
      .eq('restaurant_id', restaurant.id)
      .maybeSingle()

    const pc = paymentConfig as Record<string, unknown> | null
    const configuredMethods = pc?.payment_methods_enabled as string[] ?? ['pickup']
    const allowedByPlan = planPaymentMethods ?? configuredMethods
    const paymentMethods = configuredMethods.filter((m) => allowedByPlan.includes(m))

    const stripePublishableKey = paymentMethods.includes('card')
      ? (pc?.stripe_publishable_key as string | null ?? null)
      : null

    const now = new Date().toISOString()
    const { data: allNotices } = await admin
      .from('notices')
      .select('id, type, message, display_locations, priority')
      .eq('restaurant_id', restaurant.id)
      .eq('active', true)
      .order('priority', { ascending: false })

    const notices = (allNotices ?? []).filter((n) => {
      const r = n as Record<string, unknown>
      const starts = r.starts_at as string | null
      const expires = r.expires_at as string | null
      if (starts && starts > now) return false
      if (expires && expires < now) return false
      const locs = r.display_locations as string[] | null
      return locs?.some((l) => l === 'storefront' || l === 'checkout') ?? false
    })

    const logoKey = r.logo_r2_key as string | null
    const mediaBase = `${new URL(c.req.url).origin}/r2`
    const logoUrl = logoKey ? `${mediaBase}/${logoKey}` : null

    const customBrandColor = flags?.custom_brand_color ?? false
    const rawColors = r.brand_colors as { primary?: string; secondary?: string; accent?: string; text?: string } | null

    const schedulingEnabled = flags?.scheduled_orders_enabled ?? false

    const settings: WidgetSettings = {
      slug: r.slug as string,
      display_name: r.display_name as string,
      logo_url: logoUrl,
      font_family: null,
      brand_colors: customBrandColor && rawColors
        ? {
            primary: rawColors.primary ?? '#000000',
            secondary: rawColors.secondary ?? '#666666',
            accent: rawColors.accent ?? '#000000',
            text: rawColors.text ?? '#111111',
          }
        : null,
      currency: r.currency as string,
      timezone: r.timezone as string,
      payment_methods: paymentMethods,
      stripe_publishable_key: stripePublishableKey,
      pickup_delivery_note: pc?.pickup_delivery_note as string | null ?? null,
      tips: {
        enabled: r.tips_enabled as boolean,
        presets: r.tip_presets as number[],
        allow_custom: r.allow_custom_tip as boolean,
        show_no_tip: r.show_no_tip as boolean,
      },
      tax: {
        enabled: r.tax_enabled as boolean,
        rate: r.tax_rate as number,
        inclusive: r.tax_inclusive as boolean,
      },
      orders_paused: r.orders_paused as boolean,
      pause_reason: r.pause_reason as string | null,
      features: {
        menu_photos: flags?.menu_photos ?? false,
        item_modifiers: flags?.item_modifiers ?? false,
        promotions_enabled: flags?.promotions_enabled ?? false,
        scheduled_orders_enabled: schedulingEnabled,
        order_tracking_page: flags?.order_tracking_page ?? false,
        remove_powered_by: flags?.remove_powered_by ?? false,
        custom_brand_color: customBrandColor,
      },
      scheduling: schedulingEnabled
        ? {
            enabled: true,
            base_prep_minutes: (r.base_prep_minutes as number | null) ?? 20,
            interval_minutes: (r.scheduling_interval as number | null) ?? 15,
          }
        : null,
      notices: notices.map((n) => {
        const nr = n as Record<string, unknown>
        return {
          id: nr.id as string,
          type: nr.type as string,
          message: nr.message as string,
          display_locations: nr.display_locations as string[],
          priority: nr.priority as number,
        }
      }),
      media_base_url: mediaBase,
    }

    await settingsCache.set(cacheKey, settings, KV_TTLS['settings'] ?? 60)
    return c.json(settings)
  })
}
