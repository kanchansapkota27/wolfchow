import { useRealtime, type RealtimeStatus } from '../lib/realtime'

const STATUS: Record<RealtimeStatus, { dot: string; label: string; labelColor: string }> = {
  connected:    { dot: 'var(--md-secondary)', label: 'Live',          labelColor: 'var(--md-secondary)' },
  reconnecting: { dot: 'var(--md-tertiary)',  label: 'Reconnecting…', labelColor: 'var(--md-tertiary)' },
  disconnected: { dot: 'var(--md-error)',     label: 'Offline',       labelColor: 'var(--md-error)' },
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
