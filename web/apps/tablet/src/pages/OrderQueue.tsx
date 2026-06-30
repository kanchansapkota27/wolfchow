import { useCallback, useEffect, useRef, useState } from 'react'
import type { Order } from '@wolfchow/types'
import { useOrders } from '../lib/useOrders'
import { RejectSheet } from '../components/OrderSheet'

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(order: Order): string {
  return order.id.slice(-4).toUpperCase()
}

function useCountdown(deadlineIso: string | null): { label: string; urgent: boolean } {
  const [state, setState] = useState({ label: '', urgent: false })

  useEffect(() => {
    if (!deadlineIso) return
    function update() {
      const ms = new Date(deadlineIso!).getTime() - Date.now()
      if (ms <= 0) { setState({ label: 'Expiring', urgent: true }); return }
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      setState({ label: `${mins}:${String(secs).padStart(2, '0')}`, urgent: ms < 60_000 })
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadlineIso])

  return state
}

function useElapsed(isoDate: string): string {
  const [label, setLabel] = useState('')
  useEffect(() => {
    function update() {
      const mins = Math.floor((Date.now() - new Date(isoDate).getTime()) / 60000)
      setLabel(mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`)
    }
    update()
    const id = setInterval(update, 30_000)
    return () => clearInterval(id)
  }, [isoDate])
  return label
}

const PAYMENT_CONFIG: Record<string, { icon: string; label: string; bg: string; color: string }> = {
  card:     { icon: '💳', label: 'Card',    bg: 'rgba(99,102,241,0.2)',  color: '#818cf8' },
  pickup:   { icon: '💵', label: 'Cash',    bg: 'rgba(16,185,129,0.2)', color: '#34d399' },
  delivery: { icon: '🛵', label: 'Delivery', bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
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
  const pay = PAYMENT_CONFIG[order.payment_method] ?? { icon: '💳', label: order.payment_method, bg: 'rgba(99,102,241,0.2)', color: '#818cf8' }

  async function handleAccept() {
    setAccepting(true)
    try { await onAccept() } finally { setAccepting(false) }
  }

  return (
    <div
      className={['kds-card-in rounded-2xl border-2 flex flex-col', urgent ? 'kds-urgent' : ''].join(' ')}
      style={{
        background: urgent ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)',
        borderColor: urgent ? '#ef4444' : '#f97316',
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black tracking-widest uppercase" style={{ color: urgent ? '#ef4444' : '#f97316' }}>
            {urgent ? '🔴 URGENT' : '🟠 NEW'}
          </span>
          <span className="text-lg font-black text-white">#{shortId(order)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: pay.bg, color: pay.color }}
          >
            {pay.icon} {pay.label}
          </span>
          {countdown && (
            <span
              className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
              style={{
                background: urgent ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.15)',
                color: urgent ? '#f87171' : '#fb923c',
              }}
            >
              ⏱ {countdown}
            </span>
          )}
        </div>
      </div>

      {/* Customer */}
      <div className="px-4 pb-2">
        <p className="text-base font-bold text-white">{order.customer_name}</p>
        {order.scheduled_for && (
          <p className="mt-0.5 text-xs font-medium" style={{ color: '#60a5fa' }}>
            📅 Scheduled {new Date(order.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t" style={{ borderColor: 'rgba(249,115,22,0.2)' }} />

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {order.items?.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span
              className="mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-sm font-black text-white"
              style={{ background: 'rgba(249,115,22,0.25)' }}
            >
              {item.quantity}×
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white leading-snug">
                {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
              </p>
              {item.modifiers.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {item.modifiers.map((m, j) => (
                    <p key={j} className="text-xs" style={{ color: '#94a3b8' }}>
                      ↳ {m.name}{m.price_delta !== 0 ? ` +$${Number(m.price_delta).toFixed(2)}` : ''}
                    </p>
                  ))}
                </div>
              )}
              {item.notes && (
                <p className="mt-1 text-xs font-medium italic" style={{ color: '#fbbf24' }}>
                  📝 {item.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="mx-4 mb-3 rounded-xl px-3 py-2 text-sm italic" style={{ background: 'rgba(251,191,36,0.1)', color: '#fde68a' }}>
          📝 {order.notes}
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 border-t" style={{ borderColor: 'rgba(249,115,22,0.2)' }} />

      {/* Footer: total + actions */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>Order total</span>
          <span className="text-xl font-black text-white">${Number(order.total).toFixed(2)}</span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onDecline}
            disabled={accepting}
            className="rounded-xl border py-3.5 text-sm font-bold transition-colors disabled:opacity-40"
            style={{
              flex: '0 0 100px',
              borderColor: 'rgba(239,68,68,0.5)',
              color: '#f87171',
              background: 'rgba(239,68,68,0.08)',
            }}
          >
            ✕ Decline
          </button>
          <button
            onClick={() => void handleAccept()}
            disabled={accepting}
            className="flex-1 rounded-xl py-3.5 text-base font-black text-white transition-colors disabled:opacity-40"
            style={{ background: accepting ? '#15803d' : '#16a34a' }}
          >
            {accepting ? 'Accepting…' : '✓ Accept Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Kitchen Card (accepted / preparing) ───────────────────────────────────────

const KITCHEN_CONFIG: Record<string, { label: string; actionLabel: string; bg: string; border: string; btnBg: string; badge: string }> = {
  accepted:  { label: 'Accepted',  actionLabel: '→ Start Preparing', bg: 'rgba(59,130,246,0.07)',  border: '#3b82f6', btnBg: '#1d4ed8', badge: '#3b82f6' },
  preparing: { label: 'Preparing', actionLabel: '→ Mark Ready',      bg: 'rgba(99,102,241,0.07)', border: '#6366f1', btnBg: '#4338ca', badge: '#6366f1' },
}

interface KitchenCardProps {
  order: Order
  onAdvance: (orderId: string, nextStatus: string) => void
}

function KitchenCard({ order, onAdvance }: KitchenCardProps) {
  const [busy, setBusy] = useState(false)
  const elapsed = useElapsed(order.updated_at)
  const cfg = KITCHEN_CONFIG[order.status] ?? KITCHEN_CONFIG.accepted
  const nextStatus = order.status === 'accepted' ? 'preparing' : 'ready'
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0

  async function handleAdvance() {
    setBusy(true)
    try { onAdvance(order.id, nextStatus) } finally { setBusy(false) }
  }

  return (
    <div
      className="kds-card-in rounded-2xl border flex flex-col gap-2 p-3.5"
      style={{ background: cfg.bg, borderColor: cfg.border + '60' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-white">#{shortId(order)}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: cfg.badge + '30', color: cfg.badge }}
          >
            {cfg.label}
          </span>
        </div>
        <span className="text-xs" style={{ color: '#64748b' }}>⏱ {elapsed}</span>
      </div>

      <p className="text-sm font-semibold text-white">{order.customer_name}</p>

      <div className="space-y-1">
        {order.items?.slice(0, 4).map((item, i) => (
          <p key={i} className="text-xs leading-snug" style={{ color: '#cbd5e1' }}>
            <span className="font-bold text-white">{item.quantity}×</span>{' '}
            {item.item_name ?? item.variant_name ?? `Item ${i + 1}`}
            {item.modifiers.length > 0 && (
              <span style={{ color: '#64748b' }}> ({item.modifiers.map(m => m.name).join(', ')})</span>
            )}
          </p>
        ))}
        {(order.items?.length ?? 0) > 4 && (
          <p className="text-xs" style={{ color: '#64748b' }}>+{(order.items?.length ?? 0) - 4} more items</p>
        )}
      </div>

      {order.notes && (
        <p className="rounded-lg px-2.5 py-1.5 text-xs italic" style={{ background: 'rgba(251,191,36,0.1)', color: '#fde68a' }}>
          📝 {order.notes}
        </p>
      )}

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs font-bold text-white">{itemCount} item{itemCount !== 1 ? 's' : ''} · ${Number(order.total).toFixed(2)}</span>
        <button
          onClick={() => void handleAdvance()}
          disabled={busy}
          className="rounded-xl px-3.5 py-2 text-xs font-bold text-white transition-colors disabled:opacity-40"
          style={{ background: cfg.btnBg }}
        >
          {busy ? '…' : cfg.actionLabel}
        </button>
      </div>
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
  const elapsed = useElapsed(order.updated_at)
  const elapsedMins = Math.floor((Date.now() - new Date(order.updated_at).getTime()) / 60000)
  const overdue = elapsedMins >= 10
  const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0

  return (
    <div
      className={['kds-card-in rounded-2xl border flex flex-col gap-2 p-3.5 transition-all duration-500', completing ? 'opacity-0 scale-95' : ''].join(' ')}
      style={{ background: overdue ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)', borderColor: overdue ? '#ef444480' : '#10b98180' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-white">#{shortId(order)}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: overdue ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: overdue ? '#f87171' : '#34d399' }}
          >
            Ready ✓
          </span>
        </div>
        <span className="text-xs font-medium" style={{ color: overdue ? '#f87171' : '#64748b' }}>
          {overdue ? '⚠️' : '⏱'} {elapsed}
        </span>
      </div>

      <p className="text-sm font-semibold text-white">{order.customer_name}</p>

      <div className="space-y-0.5">
        {order.items?.slice(0, 3).map((item, i) => (
          <p key={i} className="text-xs" style={{ color: '#94a3b8' }}>
            {item.quantity}× {item.item_name ?? item.variant_name}
          </p>
        ))}
        {(order.items?.length ?? 0) > 3 && (
          <p className="text-xs" style={{ color: '#64748b' }}>+{(order.items?.length ?? 0) - 3} more</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-0.5">
        <span className="text-xs font-bold text-white">{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
        <button
          onClick={() => onComplete(order.id)}
          disabled={completing}
          className="rounded-xl px-3.5 py-2 text-xs font-bold text-white transition-colors disabled:opacity-40"
          style={{ background: '#059669' }}
        >
          ✓ Complete
        </button>
      </div>
    </div>
  )
}

// ── Column Header ─────────────────────────────────────────────────────────────

function ColHeader({ label, count, color, dimColor }: { label: string; count: number; color: string; dimColor: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#1e293b' }}>
      <div className="flex items-center gap-2.5">
        <div className="h-3 w-1 rounded-full" style={{ background: color }} />
        <span className="text-sm font-bold tracking-wide uppercase text-white">{label}</span>
      </div>
      {count > 0 && (
        <span
          className="min-w-[24px] rounded-full px-2 py-0.5 text-xs font-black text-center text-white"
          style={{ background: dimColor }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyCol({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex h-32 flex-col items-center justify-center gap-2">
      <span className="text-3xl opacity-30">{icon}</span>
      <p className="text-xs text-center" style={{ color: '#475569' }}>{message}</p>
    </div>
  )
}

// ── Main OrderQueue ───────────────────────────────────────────────────────────

export function OrderQueue() {
  const { newOrders, activeOrders, loading, accept, reject, updateStatus } = useOrders()
  const [rejectTarget, setRejectTarget] = useState<Order | null>(null)
  const [completing, setCompleting] = useState<Set<string>>(new Set())
  const prevNewCount = useRef(newOrders.length)

  // Flash tab title on new order
  useEffect(() => {
    if (newOrders.length > prevNewCount.current) {
      document.title = `🔔 ${newOrders.length} new order${newOrders.length !== 1 ? 's' : ''} — Kitchen`
    } else if (newOrders.length === 0) {
      document.title = 'Kitchen Display'
    }
    prevNewCount.current = newOrders.length
  }, [newOrders.length])

  const kitchenOrders = activeOrders.filter((o) => o.status === 'accepted' || o.status === 'preparing')
  const readyOrders   = activeOrders.filter((o) => o.status === 'ready')

  const handleAccept = useCallback(async (orderId: string) => {
    await accept(orderId)
  }, [accept])

  const handleReject = useCallback(async (reason?: string) => {
    if (!rejectTarget) return
    await reject(rejectTarget.id, reason)
    setRejectTarget(null)
  }, [rejectTarget, reject])

  const handleAdvance = useCallback((orderId: string, nextStatus: string) => {
    void updateStatus(orderId, nextStatus)
  }, [updateStatus])

  const handleComplete = useCallback((orderId: string) => {
    setCompleting((prev) => new Set([...prev, orderId]))
    setTimeout(() => {
      void updateStatus(orderId, 'completed').catch(() => {})
      setCompleting((prev) => { const next = new Set(prev); next.delete(orderId); return next })
    }, 400)
  }, [updateStatus])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4" style={{ borderColor: '#1e293b', borderTopColor: '#f97316' }} />
        <p className="text-sm" style={{ color: '#64748b' }}>Loading orders…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full" style={{ background: '#080d17' }}>
      {/* ── Column 1: New orders ── */}
      <div className="flex w-[38%] flex-col border-r" style={{ borderColor: '#1e293b' }}>
        <ColHeader label="Incoming" count={newOrders.length} color="#f97316" dimColor="#9a3412" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {newOrders.length === 0 ? (
            <EmptyCol icon="✅" message={"All caught up!\nNo new orders"} />
          ) : (
            newOrders.map((order) => (
              <NewOrderCard
                key={order.id}
                order={order}
                onAccept={() => handleAccept(order.id)}
                onDecline={() => setRejectTarget(order)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Column 2: In Kitchen ── */}
      <div className="flex w-[34%] flex-col border-r" style={{ borderColor: '#1e293b' }}>
        <ColHeader label="In Kitchen" count={kitchenOrders.length} color="#3b82f6" dimColor="#1e3a5f" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {kitchenOrders.length === 0 ? (
            <EmptyCol icon="🍳" message="Nothing cooking yet" />
          ) : (
            kitchenOrders.map((order) => (
              <KitchenCard key={order.id} order={order} onAdvance={handleAdvance} />
            ))
          )}
        </div>
      </div>

      {/* ── Column 3: Ready ── */}
      <div className="flex w-[28%] flex-col">
        <ColHeader label="Ready" count={readyOrders.length} color="#10b981" dimColor="#064e3b" />
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {readyOrders.length === 0 ? (
            <EmptyCol icon="🎉" message="Nothing waiting" />
          ) : (
            readyOrders.map((order) => (
              <ReadyCard
                key={order.id}
                order={order}
                completing={completing.has(order.id)}
                onComplete={handleComplete}
              />
            ))
          )}
        </div>
      </div>

      {/* Reject sheet */}
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
