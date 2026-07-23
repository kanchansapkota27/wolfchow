import { describe, expect, it } from 'vitest'
import { groupSlotsByDate, formatSlotTime } from './slotHelpers'

describe('STORY-082 · widget checkout slot helpers', () => {
  it('groups future slots by their local date and drops past slots', () => {
    const past = new Date(Date.now() - 3600_000).toISOString()
    const future1 = new Date(Date.now() + 3600_000).toISOString()
    const future2 = new Date(Date.now() + 7200_000).toISOString()

    const groups = groupSlotsByDate([past, future1, future2], 'UTC')
    const allSlots = [...groups.values()].flat()

    expect(allSlots).not.toContain(past)
    expect(allSlots).toContain(future1)
    expect(allSlots).toContain(future2)
  })

  it('formats a slot time in the given timezone', () => {
    const iso = '2026-01-15T14:30:00.000Z'
    const formatted = formatSlotTime(iso, 'UTC')
    expect(formatted).toMatch(/2:30\s*PM/)
  })
})
