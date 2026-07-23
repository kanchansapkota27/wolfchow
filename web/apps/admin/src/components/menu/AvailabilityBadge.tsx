import type { AvailabilityState } from '@wolfchow/types'
import { cn } from '../../lib/utils'

export const AVAIL_OPTIONS: Array<{
  value: AvailabilityState
  label: string
  dot: string
  badge: string
}> = [
  { value: 'available',    label: 'In Stock',     dot: 'bg-green-500', badge: 'bg-green-100 text-green-700' },
  { value: 'out_of_stock', label: 'Out of Stock', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
  { value: 'unavailable',  label: 'Unavailable',  dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  { value: 'scheduled',    label: 'Scheduled',    dot: 'bg-blue-400',  badge: 'bg-blue-100 text-blue-700' },
]

export function AvailabilityBadge({ state }: { state: string }) {
  const opt = (AVAIL_OPTIONS.find((o) => o.value === state) ?? AVAIL_OPTIONS[0])!
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide', opt.badge)}>
      {opt.label}
    </span>
  )
}
