import { useCallback, useEffect, useRef, useState } from 'react'
import type { Order } from '@wolfchow/types'
import { useOrders } from '../lib/useOrders'
import { RejectSheet } from '../components/OrderSheet'

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(order: Order): string {
  return `#KD-${order.id.slice(-4).toUpperCase()}`
}

function useCountdown(deadlineIso: string | null): { label: string; mins: number; urgent: boolean } {
  const [state, setState] = useState({ label: '', mins: 99, urgent: false })

  useEffect(() => {
    if (!deadlineIso) return
    function update() {
      const ms = new Date(deadlineIso!).getTime() - Date.now()
      if (ms <= 0) { setState({ label: '—', mins: 0, urgent: true }); return }
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setState({ label: `${mins}:${String(secs).padStart(2, '0')}`, mins, urgent: ms < 90_000 })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadlineIso])

  return state
}

function useElapsedTimer(isoDate: string): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function update() {
      const ms = Date.now() - new Date(isoDate).getTime()
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setLabel(mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `0:${String(secs).padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [isoDate])
  return label
}

// ── Payment badge ──────────────────────────────────────────────────────────────

const PAY_CFG: Record<string, { icon: string; label: string }> = {
  card:     { icon: 'credit_card',      label: 'Card' },
  pickup:   { icon: 'shopping_bag',     label: 'Pickup' },
  delivery: { icon: 'delivery_dining',  label: 'Delivery' },
}

// ── New Order Card ─────────────────────────────────────────────────────────────

interface NewOrderCardProps {
  order: Order
  onAccept: () => Promise<void>
  onDecline: () => void
}

function NewOrderCard({ order, onAccept, onDecline }: NewOrderCardProps) {
  const [accepting, setAccepting] = useState(false)
  const { label: countdown, urgent } = useCountdown(order.accept_deadline_at)
  const pay = PAY_CFG[order.payment_method] ?? { icon: 'credit_card', label: order.payment_method }

  async function handleAccept() {
    setAccepting(true)
    try { await onAccept() } finally { setAccepting(false) }
  }

  const borderColor = urgent ? 'var(--md-error)' : 'transparent'
  const cardBg      = urgent ? 'rgba(255,180,171,0.05)' : 'var(--md-surface-c)'

  return (
    <div
      className={['kds-card-in rounded-xl border-2 flex flex-col gap-3 p-4', urgent ? 'kds-urgent' : ''].join(' ')}
      style={{ background: cardBg, borderColor }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--md-secondary)', letterSpacing: '0.03em' }}
          >
            {shortId(order)}
          </span>
          <h3
            className="mt-0.5 font-bold leading-tight"
            style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 20, color: 'var(--md-on-surface)' }}
          >
            {order.customer_name}
          </h3>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1" style={{ color: 'var(--md-on-surface-var)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{pay.icon}</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{pay.label}</span>
          </div>
          {countdown && (
            <span
              className="font-bold tabular-nums"
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 13,
                color: urgent ? 'var(--md-error)' : 'var(--md-tertiary)',
              }}
            >
              ⏱ {countdown}
            </span>
          )}
          {urgent && (
            <span
              className="rounded px-2 py-0.5 text-xs font-bold pulse-dot"
              style={{ background: 'var(--md-error-c)', color: 'var(--md-error)', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.05em' }}
            >
              ASAP
            </span>
          )}
        </div>
      </div>

      {order.scheduled_for && (
        <p className="text-xs font-medium" style={{ color: '#60a5fa' }}>
          📅 Scheduled {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Items */}
      <div
        className="rounded-lg p-3 space-y-1.5"
        style={{ background: 'var(--md-surface-low)' }}
      >
        <p
          className="mb-2 font-bold"
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--md-on-surface)', letterSpacing: '0.05em' }}
        >
          {order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0} ITEMS
        </p>
        {order.items?.map((item, i) => (
          <div key={i} className="flex gap-2.5">
            <span
              className="shrink-0 font-black text-sm"
              style={{ color: 'var(--md-on-surface)', fontFamily: "'Hanken Grotesk',sans-serif", minWidth: 32 }}
            >
              [ {item.quantity} ]
            </span>
            <div className="min-w-0">
              <p className="text-sm leading-snug" style={{ color: 'var(--md-on-surface-var)' }}>
                {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
                {item.variant_name && item.item_name && (
                  <span style={{ color: 'var(--md-outline)' }}> · {item.variant_name}</span>
                )}
              </p>
              {item.modifiers.length > 0 && (
                <p className="text-xs mt-0.5 italic" style={{ color: 'var(--md-outline)' }}>
                  {item.modifiers.map((m) => m.name).join(', ')}
                </p>
              )}
              {item.notes && (
                <p className="text-xs mt-0.5 font-medium italic" style={{ color: 'var(--md-tertiary)' }}>
                  ↳ {item.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {order.notes && (
        <p
          className="rounded-lg px-3 py-2 text-sm italic"
          style={{ background: 'rgba(255,183,120,0.08)', color: 'var(--md-tertiary)', border: '1px solid rgba(255,183,120,0.2)' }}
        >
          📝 {order.notes}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onDecline}
          disabled={accepting}
          className="rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{
            flex: '0 0 88px',
            padding: '14px 0',
            border: '2px solid var(--md-error)',
            color: 'var(--md-error)',
            background: 'transparent',
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 12,
            letterSpacing: '0.04em',
          }}
        >
          DECLINE
        </button>
        <button
          onClick={() => void handleAccept()}
          disabled={accepting}
          className="flex-1 rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40"
          style={{
            padding: '14px 0',
            background: 'var(--md-secondary-c)',
            color: 'var(--md-on-secondary-c)',
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 13,
            letterSpacing: '0.04em',
          }}
        >
          {accepting ? 'ACCEPTING…' : 'ACCEPT'}
        </button>
      </div>
    </div>
  )
}

// ── Kitchen Card ──────────────────────────────────────────────────────────────

interface KitchenCardProps {
  order: Order
  onAdvance: (orderId: string, nextStatus: string) => void
}

function KitchenCard({ order, onAdvance }: KitchenCardProps) {
  const [busy, setBusy] = useState(false)
  const elapsed = useElapsedTimer(order.updated_at)
  const elapsedMs = Date.now() - new Date(order.updated_at).getTime()
  // A scheduled order can legitimately sit here for hours ahead of its slot —
  // the elapsed-since-accepted timer isn't a meaningful "running late" signal
  // until the slot itself has arrived, so suppress the overdue/urgent
  // treatment until then.
  const isScheduledAhead = !!order.scheduled_for && new Date(order.scheduled_for).getTime() > Date.now()
  const isOverdue = !isScheduledAhead && elapsedMs > 20 * 60_000
  const nextStatus = order.status === 'preparing' ? 'ready' : 'preparing'
  const actionLabel = order.status === 'preparing' ? 'READY FOR PICKUP' : 'START PREPARING'

  async function handleAdvance() {
    setBusy(true)
    try { onAdvance(order.id, nextStatus) } finally { setBusy(false) }
  }

  const borderColor = isOverdue ? 'var(--md-error)' : isScheduledAhead ? '#60a5fa' : 'var(--md-tertiary)'
  const timerColor  = isOverdue ? 'var(--md-error)' : isScheduledAhead ? '#60a5fa' : 'var(--md-tertiary)'

  return (
    <div
      className={['kds-card-in rounded-xl border-2 flex flex-col gap-3 p-4', isOverdue ? 'kds-urgent' : ''].join(' ')}
      style={{ background: 'var(--md-surface-c)', borderColor }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--md-on-surface-var)', letterSpacing: '0.03em' }}
          >
            {shortId(order)}
          </span>
          <h3
            className="mt-0.5 font-bold leading-tight"
            style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 19, color: 'var(--md-on-surface)' }}
          >
            {order.customer_name}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <p
            className="font-bold tabular-nums leading-none"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, color: timerColor }}
          >
            {elapsed}
          </p>
          {/* Progress bar */}
          <div
            className="mt-1.5 rounded-full overflow-hidden"
            style={{ width: 80, height: 3, background: 'var(--md-surface-chh)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, elapsedMs / (20 * 60_000) * 100)}%`,
                background: timerColor,
              }}
            />
          </div>
        </div>
      </div>

      {order.scheduled_for && (
        <p className="text-xs font-medium" style={{ color: '#60a5fa' }}>
          📅 Scheduled {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div
        className="rounded-lg p-3 space-y-1.5"
        style={{ background: 'var(--md-surface-low)' }}
      >
        {order.items?.map((item, i) => (
          <div key={i}>
            <div className="flex gap-2">
              <span className="font-black text-sm shrink-0" style={{ color: 'var(--md-on-surface)', minWidth: 28 }}>
                [ {item.quantity} ]
              </span>
              <span className="text-sm" style={{ color: 'var(--md-on-surface-var)' }}>
                {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
              </span>
            </div>
            {item.modifiers.length > 0 && (
              <p className="text-xs ml-9 italic" style={{ color: 'var(--md-outline)' }}>
                — {item.modifiers.map((m) => m.name).join(', ')}
              </p>
            )}
            {item.notes && (
              <p className="text-xs ml-9 font-medium italic" style={{ color: 'var(--md-tertiary)' }}>
                — {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => void handleAdvance()}
        disabled={busy}
        className="w-full rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40"
        style={{
          padding: '14px 0',
          background: isOverdue ? 'var(--md-error)' : isScheduledAhead ? '#60a5fa' : 'var(--md-tertiary)',
          color: isOverdue ? 'var(--md-on-error)' : isScheduledAhead ? '#0c1c33' : 'var(--md-on-tertiary)',
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13,
          letterSpacing: '0.04em',
        }}
      >
        {busy ? '…' : actionLabel}
      </button>
    </div>
  )
}

// ── Ready Card ────────────────────────────────────────────────────────────────

interface ReadyCardProps {
  order: Order
  completing: boolean
  onComplete: (orderId: string) => void
}

function ReadyCard({ order, completing, onComplete }: ReadyCardProps) {
  const elapsedMs = Date.now() - new Date(order.updated_at).getTime()
  const overdue = elapsedMs >= 10 * 60_000

  return (
    <div
      className={['kds-card-in rounded-xl border-2 flex flex-col gap-3 p-4 transition-all duration-500', completing ? 'opacity-0 scale-95' : 'opacity-90'].join(' ')}
      style={{
        background: 'var(--md-surface-c)',
        borderColor: overdue ? 'var(--md-error)' : 'var(--md-secondary)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--md-on-surface-var)', letterSpacing: '0.03em' }}
          >
            {shortId(order)}
          </span>
          <h3
            className="mt-0.5 font-bold leading-tight"
            style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 19, color: 'var(--md-on-surface)' }}
          >
            {order.customer_name}
          </h3>
        </div>
        <span
          className="material-symbols-outlined material-symbols-filled"
          style={{ fontSize: 36, color: overdue ? 'var(--md-error)' : 'var(--md-secondary)', fontVariationSettings: "'FILL' 1" }}
        >
          {overdue ? 'warning' : 'check_circle'}
        </span>
      </div>

      {order.scheduled_for && (
        <p className="text-xs font-medium" style={{ color: '#60a5fa' }}>
          📅 Scheduled {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      <div
        className="rounded-lg p-3 space-y-1"
        style={{ background: 'var(--md-surface-low)', borderLeft: `2px solid ${overdue ? 'var(--md-error)' : 'rgba(125,255,162,0.3)'}` }}
      >
        {overdue && (
          <p
            className="text-xs font-bold mb-1"
            style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--md-error)', letterSpacing: '0.05em' }}
          >
            WAITING {Math.floor(elapsedMs / 60_000)}+ MIN
          </p>
        )}
        {order.items?.slice(0, 3).map((item, i) => (
          <p key={i} className="text-sm" style={{ color: 'var(--md-on-surface-var)' }}>
            <span className="font-black" style={{ color: 'var(--md-on-surface)' }}>[{item.quantity}]</span>{' '}
            {item.item_name ?? item.variant_name}
          </p>
        ))}
        {(order.items?.length ?? 0) > 3 && (
          <p className="text-xs" style={{ color: 'var(--md-outline)' }}>
            +{(order.items?.length ?? 0) - 3} more items
          </p>
        )}
      </div>

      <button
        onClick={() => onComplete(order.id)}
        disabled={completing}
        className="w-full rounded-lg font-bold transition-all active:scale-95 disabled:opacity-40"
        style={{
          padding: '12px 0',
          background: 'var(--md-surface-bright)',
          color: overdue ? 'var(--md-error)' : 'var(--md-secondary)',
          border: `1px solid ${overdue ? 'var(--md-error)' : 'var(--md-secondary)'}`,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 13,
          letterSpacing: '0.04em',
        }}
      >
        COMPLETE ORDER
      </button>
    </div>
  )
}

// ── Column Header ─────────────────────────────────────────────────────────────

function ColHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="flex items-end justify-between pb-3"
      style={{ borderBottom: '1px solid var(--md-outline-var)' }}
    >
      <h2
        className="font-bold"
        style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 22, color: 'var(--md-on-surface)' }}
      >
        {label}
      </h2>
      <span
        className="rounded px-2 py-1 font-bold"
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 12,
          letterSpacing: '0.04em',
          background: 'var(--md-surface-c)',
          color: count > 0 ? color : 'var(--md-on-surface-var)',
        }}
      >
        {count > 0 ? `${count} ${label === 'INCOMING' ? 'NEW' : label === 'PREPARING' ? 'ACTIVE' : 'READY'}` : 'CLEAR'}
      </span>
    </div>
  )
}

function EmptyCol({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3">
      <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--md-outline-var)' }}>{icon}</span>
      <p className="text-center text-sm" style={{ color: 'var(--md-outline)' }}>{message}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function OrderQueue() {
  const { newOrders, activeOrders, loading, accept, reject, updateStatus } = useOrders()
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const prevNewCount = useRef(newOrders.length)

  useEffect(() => {
    if (newOrders.length > prevNewCount.current) {
      document.title = `(${newOrders.length}) New Orders — KitchenCommand`
    } else if (newOrders.length === 0) {
      document.title = 'KitchenCommand · Live Orders'
    }
    prevNewCount.current = newOrders.length
  }, [newOrders.length])

  const kitchenOrders = activeOrders.filter((o) => o.status === 'accepted' || o.status === 'preparing')
  const readyOrders   = activeOrders.filter((o) => o.status === 'ready')

  // Scheduled orders stay at 'accepted' after Accept — kitchen decides when to
  // start prep, closer to the actual scheduled time, via the KitchenCard's own
  // "START PREPARING" button. ASAP orders skip straight to 'preparing' as before.
  const handleAccept  = useCallback(async (id: string, scheduledFor: string | null) => {
    await accept(id)
    if (!scheduledFor) await updateStatus(id, 'preparing')
  }, [accept, updateStatus])
  const handleReject  = useCallback(async (reason?: string) => {
    if (!rejectTarget) return
    await reject(rejectTarget.id, reason)
    setRejectTarget(null)
  }, [rejectTarget, reject])
  const handleAdvance = useCallback((id: string, next: string) => { void updateStatus(id, next) }, [updateStatus])
  const handleComplete = useCallback((id: string) => {
    setCompleting((p) => new Set([...p, id]))
    setTimeout(() => {
      void updateStatus(id, 'completed').catch(() => {})
      setCompleting((p) => { const n = new Set(p); n.delete(id); return n })
    }, 400)
  }, [updateStatus])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3" style={{ background: 'var(--md-bg)' }}>
        <div
          className="h-10 w-10 animate-spin rounded-full border-4"
          style={{ borderColor: 'var(--md-surface-ch)', borderTopColor: 'var(--md-secondary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--md-outline)' }}>Loading orders…</p>
      </div>
    )
  }

  return (
    <div
      className="flex h-full gap-0 overflow-x-auto"
      style={{ background: 'var(--md-bg)', minWidth: 0 }}
    >
      {/* Incoming */}
      <section
        className="flex flex-none flex-col gap-4 p-6"
        style={{ width: '38%', minWidth: 300, borderRight: '1px solid var(--md-outline-var)' }}
      >
        <ColHeader label="INCOMING" count={newOrders.length} color="var(--md-secondary)" />
        <div className="flex-1 overflow-y-auto order-scroll space-y-3">
          {newOrders.length === 0
            ? <EmptyCol icon="check_circle" message="All clear — no new orders" />
            : newOrders.map((o) => (
                <NewOrderCard
                  key={o.id}
                  order={o}
                  onAccept={() => handleAccept(o.id, o.scheduled_for)}
                  onDecline={() => setRejectTarget(o)}
                />
              ))
          }
        </div>
      </section>

      {/* Preparing */}
      <section
        className="flex flex-none flex-col gap-4 p-6"
        style={{ width: '34%', minWidth: 280, borderRight: '1px solid var(--md-outline-var)' }}
      >
        <ColHeader label="PREPARING" count={kitchenOrders.length} color="var(--md-tertiary)" />
        <div className="flex-1 overflow-y-auto order-scroll space-y-3">
          {kitchenOrders.length === 0
            ? <EmptyCol icon="skillet" message="Nothing cooking yet" />
            : kitchenOrders.map((o) => (
                <KitchenCard key={o.id} order={o} onAdvance={handleAdvance} />
              ))
          }
        </div>
      </section>

      {/* Ready */}
      <section
        className="flex flex-none flex-col gap-4 p-6"
        style={{ width: '28%', minWidth: 240 }}
      >
        <ColHeader label="READY" count={readyOrders.length} color="var(--md-secondary)" />
        <div className="flex-1 overflow-y-auto order-scroll space-y-3">
          {readyOrders.length === 0
            ? <EmptyCol icon="celebration" message="Nothing waiting for pickup" />
            : readyOrders.map((o) => (
                <ReadyCard
                  key={o.id}
                  order={o}
                  completing={completing.has(o.id)}
                  onComplete={handleComplete}
                />
              ))
          }
        </div>
      </section>

      {rejectTarget && (
        <RejectSheet
          orderName={rejectTarget.customer_name}
          shortId={shortId(rejectTarget)}
          onReject={handleReject}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
  )
}
