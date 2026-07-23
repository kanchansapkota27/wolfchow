// ── Slot helpers (timezone-aware) ─────────────────────────────────────────────

export function localDateOf(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(isoStr))
}

export function groupSlotsByDate(slots: string[], tz: string): Map<string, string[]> {
  const now = Date.now()
  const groups = new Map<string, string[]>()
  for (const slot of slots) {
    if (new Date(slot).getTime() <= now) continue  // filter already-past slots
    const d = localDateOf(slot, tz)
    const arr = groups.get(d) ?? []
    arr.push(slot)
    groups.set(d, arr)
  }
  return groups
}

export function formatDateChip(dateStr: string, firstSlotInDay: string, tz: string): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + 86400000),
  )
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  // Use the slot timestamp displayed in restaurant tz to get the correct weekday/date
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(firstSlotInDay))
}

export function formatSlotTime(isoStr: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoStr))
}
