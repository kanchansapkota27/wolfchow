import { formatSlotTime } from './components/checkout/slotHelpers'

/** Maps a POST /orders error body to the message shown to the customer. */
export function mapOrderErrorBody(body: Record<string, unknown> | undefined, timezone: string): string {
  if (body?.error === 'restaurant_closed') {
    const nextOpen = body.next_open as string | null | undefined
    return nextOpen
      ? `We're closed right now. We reopen at ${formatSlotTime(nextOpen, timezone)}.`
      : "We're closed right now. Please try again later."
  }
  if (body?.error === 'orders_paused') return 'Orders are currently paused. Please try again later.'
  if (body?.error === 'item_unavailable') return 'One or more items in your cart are no longer available.'
  if (body?.error === 'payment_method_not_allowed') return 'This payment method is not available.'
  if (body?.error === 'payment_intent_failed') return 'Payment could not be processed. Please try again.'
  return 'Failed to place order. Please try again.'
}
