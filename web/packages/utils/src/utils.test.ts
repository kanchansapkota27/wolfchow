import { describe, expect, it } from 'vitest'
import type { OrderStatus } from '@wolfchow/types'
import {
  calcPromoDiscount,
  formatCurrency,
  formatSlot,
  orderStatusLabel,
  slugify,
} from './index'

describe('STORY-047 · utils', () => {
  describe('formatCurrency', () => {
    it('formatCurrency(1234.5, "TRY") → "₺1.234,50"', () => {
      expect(formatCurrency(1234.5, 'TRY')).toBe('₺1.234,50')
    })

    it('formats USD with en-US conventions', () => {
      expect(formatCurrency(1234.5, 'USD')).toBe('$1,234.50')
    })

    it('is case-insensitive on the currency code', () => {
      expect(formatCurrency(1234.5, 'try')).toBe('₺1.234,50')
    })
  })

  describe('orderStatusLabel', () => {
    it('covers all 9 statuses', () => {
      const expected: OrderStatus[] = [
        'pending_payment',
        'auth_success',
        'accepted',
        'preparing',
        'ready',
        'completed',
        'rejected',
        'missed',
        'refunded',
      ]
      expect(Object.keys(orderStatusLabel).sort()).toEqual([...expected].sort())
      for (const status of expected) {
        expect(orderStatusLabel[status].label.length).toBeGreaterThan(0)
        expect(orderStatusLabel[status].color).toBeTruthy()
      }
    })
  })

  describe('slugify', () => {
    it('lowercases, hyphenates, and trims', () => {
      expect(slugify("Joe's Pizza & Grill!")).toBe('joe-s-pizza-grill')
    })

    it('strips diacritics and caps at 40 chars with no trailing hyphen', () => {
      expect(slugify('Café Münchën')).toBe('cafe-munchen')
      const long = slugify('a'.repeat(60))
      expect(long.length).toBe(40)
      expect(long.endsWith('-')).toBe(false)
    })
  })

  describe('calcPromoDiscount', () => {
    it('percentage of subtotal', () => {
      expect(
        calcPromoDiscount(
          { subtotal: 200 },
          { discount_type: 'percentage', discount_value: 10, minimum_order_amount: null },
        ),
      ).toBe(20)
    })

    it('fixed amount, capped at subtotal', () => {
      expect(
        calcPromoDiscount(
          { subtotal: 8 },
          { discount_type: 'fixed', discount_value: 15, minimum_order_amount: null },
        ),
      ).toBe(8)
    })

    it('returns 0 below minimum order amount', () => {
      expect(
        calcPromoDiscount(
          { subtotal: 30 },
          { discount_type: 'percentage', discount_value: 50, minimum_order_amount: 50 },
        ),
      ).toBe(0)
    })

    it('free_item / bogo contribute no subtotal discount', () => {
      expect(
        calcPromoDiscount(
          { subtotal: 100 },
          { discount_type: 'bogo', discount_value: 1, minimum_order_amount: null },
        ),
      ).toBe(0)
    })
  })

  describe('formatSlot', () => {
    const tz = 'Europe/Istanbul'
    const now = new Date('2026-06-16T09:00:00Z') // 12:00 in Istanbul (UTC+3)

    it('labels same-day slots as "Today"', () => {
      expect(formatSlot('2026-06-16T11:30:00Z', tz, now)).toBe('Today at 2:30 PM')
    })

    it('labels next-day slots as "Tomorrow"', () => {
      expect(formatSlot('2026-06-17T07:00:00Z', tz, now)).toBe('Tomorrow at 10:00 AM')
    })

    it('labels further-out slots with weekday and date', () => {
      expect(formatSlot('2026-06-20T11:30:00Z', tz, now)).toContain('Sat')
    })
  })
})
