import type { Order, Promotion } from '@wolfchow/types'

/** Round to 2dp, avoiding binary float drift (e.g. 0.1 + 0.2). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute the discount a promotion grants on an order, in the order's currency.
 *
 * - `percentage`: `discount_value`% of the subtotal
 * - `fixed`: a flat `discount_value` off
 * - `free_item` / `bogo`: item-level promotions priced during cart assembly;
 *   they contribute no subtotal-level discount here, so this returns 0.
 *
 * The result never exceeds the subtotal, and is 0 when the order falls under
 * the promotion's `minimum_order_amount`.
 */
export function calcPromoDiscount(
  order: Pick<Order, 'subtotal'>,
  promo: Pick<Promotion, 'discount_type' | 'discount_value' | 'minimum_order_amount'>,
): number {
  const { subtotal } = order
  if (subtotal <= 0) return 0
  if (promo.minimum_order_amount != null && subtotal < promo.minimum_order_amount) {
    return 0
  }

  let discount = 0
  switch (promo.discount_type) {
    case 'percentage':
      discount = (subtotal * promo.discount_value) / 100
      break
    case 'fixed':
      discount = promo.discount_value
      break
    case 'free_item':
    case 'bogo':
      discount = 0
      break
  }

  return round2(Math.min(discount, subtotal))
}
