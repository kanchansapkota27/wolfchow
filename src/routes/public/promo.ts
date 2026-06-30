import { z } from 'zod'
import type { Hono } from 'hono'
import type { HonoEnv } from '../../types'
import { createAdminClient } from '../../services/supabase'

const PROMO_CODE_RE = /^[A-Z0-9_-]{1,50}$/

const validatePromoSchema = z.object({
  code: z.string().min(1).max(50).transform((v) => v.toUpperCase()).refine((v) => PROMO_CODE_RE.test(v), 'Invalid promo code format'),
  subtotal: z.number().min(0),
})

async function parseBody(req: Request): Promise<unknown> {
  try { return await req.json() } catch { return null }
}

export function registerPublicPromoRoutes(app: Hono<HonoEnv>): void {
  app.post('/public/:slug/promo/validate', async (c) => {
    const slug = c.req.param('slug')

    const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
    const rate = await c.env.RATE_LIMITER_PUBLIC.limit({ key: `promo:${ip}` })
    if (!rate.success) return c.json({ error: 'rate_limited' }, 429)

    const parsed = validatePromoSchema.safeParse(await parseBody(c.req.raw))
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 422)

    const admin = createAdminClient(c.env)

    const { data: restaurant } = await admin
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .eq('active', true)
      .maybeSingle()

    if (!restaurant) return c.json({ valid: false, message: 'Restaurant not found' }, 404)

    const restaurantId = (restaurant as Record<string, unknown>).id as string
    const { code, subtotal } = parsed.data

    const now = new Date().toISOString()
    const { data: promos } = await admin
      .from('promotions')
      .select('id, title, discount_type, discount_value, free_item_id, minimum_order_amount, usage_limit, usage_count, auto_apply, start_time, end_time, active_days, active')
      .eq('restaurant_id', restaurantId)
      .eq('active', true)
      .eq('promo_code', code)  // exact match; code is already uppercased by schema

    const promo = (promos ?? []).find((p) => {
      const pr = p as Record<string, unknown>
      const start = pr.start_time as string | null
      const end = pr.end_time as string | null
      if (start && start > now) return false
      if (end && end < now) return false
      const usageLimit = pr.usage_limit as number | null
      const usageCount = pr.usage_count as number
      if (usageLimit !== null && usageCount >= usageLimit) return false
      return true
    }) as Record<string, unknown> | undefined

    if (!promo) {
      return c.json({ valid: false, message: 'Invalid or expired promo code' })
    }

    const minOrder = promo.minimum_order_amount as number | null
    if (minOrder !== null && subtotal < minOrder) {
      return c.json({
        valid: false,
        message: `Minimum order of ${minOrder} required for this promo`,
      })
    }

    const discountType = promo.discount_type as string
    const discountValue = promo.discount_value as number
    let discountAmount = 0

    if (discountType === 'percentage') {
      discountAmount = Math.round((subtotal * discountValue) / 100 * 100) / 100
    } else if (discountType === 'fixed') {
      discountAmount = Math.min(discountValue, subtotal)
    } else if (discountType === 'free_item') {
      discountAmount = 0 // handled at order creation
    } else if (discountType === 'bogo') {
      discountAmount = 0 // handled at order creation
    }

    return c.json({
      valid: true,
      promo_id: promo.id as string,
      title: promo.title as string,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      free_item_id: promo.free_item_id as string | null,
    })
  })
}
