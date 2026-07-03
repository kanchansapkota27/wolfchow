// ── Types ──────────────────────────────────────────────────────────────────────

export interface HoursRow {
  day_of_week: number              // 0 = Sunday, local timezone
  open_time: string                // HH:MM, local time
  close_time: string               // HH:MM, local time
  active: boolean
  last_order_offset_minutes: number
  crosses_midnight: boolean
}

export interface ClosureRow {
  closure_type: string             // 'full' | 'partial' | 'holiday' | etc.
  date: string                     // YYYY-MM-DD, local date in restaurant timezone
  partial_open: string | null      // HH:MM local, required when type === 'partial'
  partial_close: string | null
  recurring: boolean               // true = recurs annually on the same MM-DD
}

export interface SlotConfig {
  base_prep_minutes: number
  interval_minutes: number         // 15 or 30
  future_days: number
  timezone: string                 // IANA tz string, e.g. 'America/New_York'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/** YYYY-MM-DD in the given timezone. */
function localDateStr(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms))
}

/** Minute-of-day (0–1439) in the given timezone. */
function localMinuteOfDay(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms))
  const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10)
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10)
  return ((isNaN(h) ? 0 : h) % 24) * 60 + (isNaN(m) ? 0 : m)
}

/** Day of week (0 = Sunday) for a local date string YYYY-MM-DD. */
function dayOfWeekForDate(dateStr: string): number {
  // Parse as UTC midnight — the weekday of a calendar date is timezone-independent.
  return new Date(dateStr + 'T00:00:00Z').getUTCDay()
}

/** Previous local calendar date (YYYY-MM-DD). */
function prevDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, mo! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() - 1)
  return dt.toISOString().slice(0, 10)
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Compute all available order slots from `fromMs` (epoch ms) onwards.
 *
 * - Respects operating hours, special closures (full and partial), and the
 *   configured slot interval / future-days window.
 * - All times in `hours` and `closures` are in the restaurant's local timezone
 *   (`config.timezone`); all returned slot strings are ISO 8601 UTC.
 * - Handles overnight shifts: a day with `crosses_midnight = true` contributes
 *   both its evening slots AND the early-morning slots on the following day.
 */
export function computeSlots(
  fromMs: number,
  config: SlotConfig,
  hours: HoursRow[],
  closures: ClosureRow[],
): string[] {
  const { interval_minutes, future_days, timezone } = config
  const byDay = new Map(hours.map((h) => [h.day_of_week, h]))
  const slots: string[] = []

  // Round `fromMs` up to the next interval boundary in UTC minutes.
  const fromTotalMins = Math.floor(fromMs / 60000)
  const remainder = fromTotalMins % interval_minutes
  const startMins = remainder === 0 ? fromTotalMins : fromTotalMins + (interval_minutes - remainder)

  // Window: from startMins until end of (today + future_days) calendar days in restaurant timezone.
  // future_days=0 → today only; future_days=1 → today + tomorrow; etc.
  const todayDateStr = localDateStr(fromMs, timezone)
  const [ty, tm, td] = todayDateStr.split('-').map(Number)
  const endDateStr = new Date(Date.UTC(ty!, tm! - 1, td! + future_days)).toISOString().slice(0, 10)

  // Index closures for O(1) lookup.
  const fullClosureDates = new Set<string>()  // YYYY-MM-DD or r:MM-DD (recurring)
  const partialOverrides = new Map<string, { openMins: number; closeMins: number }>()

  for (const cl of closures) {
    const mmdd = cl.date.slice(5)
    const key = cl.recurring ? `r:${mmdd}` : cl.date
    if (cl.closure_type === 'partial' && cl.partial_open && cl.partial_close) {
      partialOverrides.set(key, { openMins: toMins(cl.partial_open), closeMins: toMins(cl.partial_close) })
    } else {
      fullClosureDates.add(key)
    }
  }

  function isFullClosure(date: string): boolean {
    return fullClosureDates.has(date) || fullClosureDates.has(`r:${date.slice(5)}`)
  }

  function getPartial(date: string): { openMins: number; closeMins: number } | null {
    return partialOverrides.get(date) ?? partialOverrides.get(`r:${date.slice(5)}`) ?? null
  }

  for (let candidate = startMins; ; candidate += interval_minutes) {
    const candidateMs = candidate * 60000
    const dateStr = localDateStr(candidateMs, timezone)
    if (dateStr > endDateStr) break

    if (isFullClosure(dateStr)) continue

    const minuteOfDay = localMinuteOfDay(candidateMs, timezone)
    const dow = dayOfWeekForDate(dateStr)
    const partial = getPartial(dateStr)

    if (partial) {
      // Partial closure: use reduced hours for this date (no overnight support)
      if (minuteOfDay >= partial.openMins && minuteOfDay < partial.closeMins) {
        slots.push(new Date(candidateMs).toISOString())
      }
      continue
    }

    if (!hours.length) {
      // No hours configured → always open
      slots.push(new Date(candidateMs).toISOString())
      continue
    }

    let valid = false

    // Check whether yesterday's crosses-midnight shift covers this early-morning time.
    const yest = prevDate(dateStr)
    if (!isFullClosure(yest) && !getPartial(yest)) {
      const prevRow = byDay.get(dayOfWeekForDate(yest))
      if (prevRow?.active && prevRow.crosses_midnight) {
        const prevLastOrder = toMins(prevRow.close_time) - prevRow.last_order_offset_minutes
        if (minuteOfDay < prevLastOrder) valid = true
      }
    }

    // Check today's operating hours.
    if (!valid) {
      const row = byDay.get(dow)
      if (row?.active) {
        const openMins = toMins(row.open_time)
        const lastOrderMins = toMins(row.close_time) - row.last_order_offset_minutes
        if (row.crosses_midnight) {
          // Only the before-midnight portion; after-midnight is handled by the next day's prevRow check.
          if (minuteOfDay >= openMins) valid = true
        } else {
          if (minuteOfDay >= openMins && minuteOfDay < lastOrderMins) valid = true
        }
      }
    }

    if (valid) slots.push(new Date(candidateMs).toISOString())
  }

  return slots
}
