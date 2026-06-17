/**
 * Timezone-aware display of an ISO timestamp, e.g. "16 Jun 2026, 14:30".
 */
export function formatDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** The YYYY-MM-DD calendar date of `d` as observed in `timezone`. */
function zonedDateKey(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * Human-friendly slot label relative to "now" in the given timezone:
 * "Today at 2:30 PM", "Tomorrow at 10:00 AM", else "Mon, 16 Jun at 2:30 PM".
 */
export function formatSlot(iso: string, timezone: string, now: Date = new Date()): string {
  const target = new Date(iso)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(target)

  const targetKey = zonedDateKey(target, timezone)
  const todayKey = zonedDateKey(now, timezone)
  const tomorrowKey = zonedDateKey(new Date(now.getTime() + 86_400_000), timezone)

  if (targetKey === todayKey) return `Today at ${time}`
  if (targetKey === tomorrowKey) return `Tomorrow at ${time}`

  const day = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(target)
  return `${day} at ${time}`
}
