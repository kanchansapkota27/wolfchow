import { useRealtime, type RealtimeStatus } from '../lib/realtime'

const BADGE: Record<RealtimeStatus, { cls: string; title: string }> = {
  connected:    { cls: 'bg-green-400',            title: 'Realtime connected' },
  reconnecting: { cls: 'bg-amber-400 animate-pulse', title: 'Reconnecting…' },
  disconnected: { cls: 'bg-red-500',              title: 'Realtime disconnected' },
}

export function ConnectionBadge() {
  const { status } = useRealtime()
  const { cls, title } = BADGE[status]
  return (
    <span
      title={title}
      aria-label={title}
      className={['h-2.5 w-2.5 rounded-full shrink-0', cls].join(' ')}
    />
  )
}
