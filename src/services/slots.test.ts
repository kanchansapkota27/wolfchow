import { describe, expect, it } from 'vitest'
import { isOpenNow, type HoursRow, type ClosureRow, type SlotConfig } from './slots'

const UTC_CONFIG: SlotConfig = {
  base_prep_minutes: 20,
  interval_minutes: 15,
  future_days: 7,
  timezone: 'UTC',
}

// 2026-07-22 is a Wednesday (day_of_week = 3).
const WED = new Date('2026-07-22T00:00:00Z').getUTCDay()

function hoursRow(overrides: Partial<HoursRow> = {}): HoursRow {
  return {
    day_of_week: WED,
    open_time: '09:00',
    close_time: '21:00',
    active: true,
    last_order_offset_minutes: 30,
    crosses_midnight: false,
    ...overrides,
  }
}

describe('isOpenNow', () => {
  it('no hours configured: always open', () => {
    const result = isOpenNow(new Date('2026-07-22T03:00:00Z').getTime(), UTC_CONFIG, [], [])
    expect(result).toEqual({ open: true, next_open: null })
  })

  it('within open hours, well before the last-order cutoff: open', () => {
    const now = new Date('2026-07-22T14:00:00Z').getTime() // 14:00, well within 09:00-21:00
    const result = isOpenNow(now, UTC_CONFIG, [hoursRow()], [])
    expect(result.open).toBe(true)
    expect(result.next_open).toBeNull()
  })

  it('before opening time: closed, next_open is today\'s opening time', () => {
    const now = new Date('2026-07-22T06:00:00Z').getTime() // 06:00, before 09:00 open
    const result = isOpenNow(now, UTC_CONFIG, [hoursRow()], [])
    expect(result.open).toBe(false)
    expect(result.next_open).toBe('2026-07-22T09:00:00.000Z')
  })

  it('past the last-order cutoff (close_time - offset): closed', () => {
    // close 21:00, offset 30min → last order accepted at 20:30. 20:45 is past that.
    const now = new Date('2026-07-22T20:45:00Z').getTime()
    const result = isOpenNow(now, UTC_CONFIG, [hoursRow()], [])
    expect(result.open).toBe(false)
  })

  it('full closure today: closed, next_open skips to the following valid day', () => {
    const now = new Date('2026-07-22T14:00:00Z').getTime()
    const hours = [
      hoursRow({ day_of_week: WED }),
      hoursRow({ day_of_week: (WED + 1) % 7, open_time: '10:00', close_time: '18:00' }),
    ]
    const closures: ClosureRow[] = [
      { closure_type: 'full', date: '2026-07-22', partial_open: null, partial_close: null, recurring: false },
    ]
    const result = isOpenNow(now, UTC_CONFIG, hours, closures)
    expect(result.open).toBe(false)
    expect(result.next_open).toBe('2026-07-23T10:00:00.000Z')
  })

  it('inactive day: closed', () => {
    const now = new Date('2026-07-22T14:00:00Z').getTime()
    const result = isOpenNow(now, UTC_CONFIG, [hoursRow({ active: false })], [])
    expect(result.open).toBe(false)
  })
})
