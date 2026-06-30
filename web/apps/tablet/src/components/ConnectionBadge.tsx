import { useRealtime, type RealtimeStatus } from '../lib/realtime'

const STATUS: Record<RealtimeStatus, { dot: string; label: string; labelColor: string }> = {
  connected:    { dot: '#10b981', label: 'Live',          labelColor: '#10b981' },
  reconnecting: { dot: '#f59e0b', label: 'Reconnecting…', labelColor: '#f59e0b' },
  disconnected: { dot: '#ef4444', label: 'Offline',       labelColor: '#ef4444' },
}

export function ConnectionBadge() {
  const { status } = useRealtime()
  const { dot, label, labelColor } = STATUS[status]
  const pulsing = status === 'reconnecting'

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={['h-2.5 w-2.5 rounded-full', pulsing ? 'animate-pulse' : ''].join(' ')}
        style={{ background: dot }}
      />
      <span className="text-xs font-medium" style={{ color: labelColor }}>{label}</span>
    </div>
  )
}
