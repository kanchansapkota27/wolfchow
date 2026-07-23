import { describe, expect, it } from 'vitest'
import { mapOrderErrorBody } from './orderErrors'

describe('mapOrderErrorBody', () => {
  it('restaurant_closed with next_open: shows the reopen time', () => {
    const msg = mapOrderErrorBody(
      { error: 'restaurant_closed', next_open: '2026-07-22T14:00:00.000Z' },
      'UTC',
    )
    expect(msg).toBe("We're closed right now. We reopen at 2:00 PM.")
  })

  it('restaurant_closed with no next_open: generic closed message', () => {
    const msg = mapOrderErrorBody({ error: 'restaurant_closed', next_open: null }, 'UTC')
    expect(msg).toBe("We're closed right now. Please try again later.")
  })

  it('orders_paused: shows paused message', () => {
    expect(mapOrderErrorBody({ error: 'orders_paused' }, 'UTC')).toBe(
      'Orders are currently paused. Please try again later.',
    )
  })

  it('item_unavailable: shows unavailable message', () => {
    expect(mapOrderErrorBody({ error: 'item_unavailable' }, 'UTC')).toBe(
      'One or more items in your cart are no longer available.',
    )
  })

  it('payment_method_not_allowed: shows method message', () => {
    expect(mapOrderErrorBody({ error: 'payment_method_not_allowed' }, 'UTC')).toBe(
      'This payment method is not available.',
    )
  })

  it('payment_intent_failed: shows payment failure message', () => {
    expect(mapOrderErrorBody({ error: 'payment_intent_failed' }, 'UTC')).toBe(
      'Payment could not be processed. Please try again.',
    )
  })

  it('unknown or missing error: generic fallback', () => {
    expect(mapOrderErrorBody(undefined, 'UTC')).toBe('Failed to place order. Please try again.')
    expect(mapOrderErrorBody({ error: 'something_else' }, 'UTC')).toBe('Failed to place order. Please try again.')
  })
})
