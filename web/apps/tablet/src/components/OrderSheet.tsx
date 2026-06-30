import { useState } from 'react'
import type { Order } from '@wolfchow/types'

const PAYMENT_LABELS: Record<string, string> = {
  card: '💳 Card',
  pickup: '💵 Cash',
  delivery: '🛵 Delivery',
}

const REJECT_PRESETS = [
  'Out of stock',
  'Too busy right now',
  'Kitchen closing soon',
  'Item unavailable',
  'Store closed',
]

interface Props {
  order: Order
  onAccept: () => Promise<void>
  onReject: (reason?: string) => Promise<void>
  onClose: () => void
}

export function OrderSheet({ order, onAccept, onReject, onClose }: Props) {
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectStep, setRejectStep] = useState(false)
  const [rejectPreset, setRejectPreset] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  async function handleAccept() {
    setAccepting(true)
    try { await onAccept() } finally { setAccepting(false) }
  }

  async function handleReject() {
    const reason = rejectPreset ?? (rejectNote.trim() || undefined)
    setRejecting(true)
    try { await onReject(reason) } finally { setRejecting(false) }
  }

  function openRejectStep() {
    setRejectStep(true)
    setRejectPreset(null)
    setRejectNote('')
  }

  function cancelReject() {
    setRejectStep(false)
    setRejectPreset(null)
    setRejectNote('')
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order details"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-gray-800 p-6 shadow-2xl"
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-600" />

        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-100">{order.customer_name}</p>
            <p className="text-sm text-gray-400">{order.customer_email}{order.customer_phone ? ` · ${order.customer_phone}` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-white">${Number(order.total).toFixed(2)}</p>
            <p className="text-xs text-gray-400">{PAYMENT_LABELS[order.payment_method] ?? order.payment_method}</p>
            {order.tip_amount > 0 && (
              <p className="text-xs text-green-400">tip ${Number(order.tip_amount).toFixed(2)}</p>
            )}
          </div>
        </div>

        {/* Scheduled badge */}
        {order.scheduled_for && (
          <div className="mb-4 rounded-lg bg-blue-900/40 px-3 py-2 text-sm text-blue-300">
            Scheduled for {new Date(order.scheduled_for).toLocaleString()}
          </div>
        )}

        {/* Notes */}
        {order.notes && (
          <div className="mb-4 rounded-lg bg-amber-900/30 px-3 py-2 text-sm italic text-amber-200">
            "{order.notes}"
          </div>
        )}

        {/* Items */}
        <div className="mb-6 space-y-3">
          {order.items?.map((item, i) => (
            <div key={i} className="rounded-lg bg-gray-700/50 p-3">
              <div className="flex items-start justify-between">
                <span className="font-medium text-gray-100">
                  {item.quantity}× {item.item_name ?? item.variant_name ?? `Item #${i + 1}`}
                </span>
                <span className="text-sm text-gray-300">
                  ${(item.unit_price * item.quantity).toFixed(2)}
                </span>
              </div>
              {item.modifiers.length > 0 && (
                <div className="mt-1.5 space-y-0.5 pl-2">
                  {item.modifiers.map((m, j) => (
                    <p key={j} className="text-xs text-gray-400">
                      + {m.name}{m.price_delta !== 0 ? ` (+$${Number(m.price_delta).toFixed(2)})` : ''}
                    </p>
                  ))}
                </div>
              )}
              {item.notes && (
                <p className="mt-1 pl-2 text-xs italic text-gray-500">{item.notes}</p>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        {order.status === 'auth_success' && !rejectStep && (
          <div className="flex gap-3">
            <button
              onClick={openRejectStep}
              disabled={accepting}
              className="flex-1 rounded-xl border border-red-500/60 py-3.5 text-base font-semibold text-red-400 disabled:opacity-40 hover:bg-red-900/20"
            >
              Reject
            </button>
            <button
              onClick={() => void handleAccept()}
              disabled={accepting}
              className="flex-[2] rounded-xl bg-green-600 py-3.5 text-base font-semibold text-white disabled:opacity-40 hover:bg-green-500"
            >
              {accepting ? 'Accepting…' : 'Accept Order'}
            </button>
          </div>
        )}

        {order.status === 'auth_success' && rejectStep && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-300">Reason for rejection <span className="text-gray-500 font-normal">(optional)</span></p>

            {/* Preset chips */}
            <div className="flex flex-wrap gap-2">
              {REJECT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setRejectPreset(rejectPreset === preset ? null : preset)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    rejectPreset === preset
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                  ].join(' ')}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Custom note — only shown when no preset selected */}
            {!rejectPreset && (
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Custom reason…"
                rows={2}
                maxLength={500}
                className="w-full rounded-xl bg-gray-700/60 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-red-500/60"
              />
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={cancelReject}
                disabled={rejecting}
                className="flex-1 rounded-xl border border-gray-600 py-3 text-sm font-semibold text-gray-400 hover:bg-gray-700/50 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleReject()}
                disabled={rejecting}
                className="flex-[2] rounded-xl bg-red-700 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-40"
              >
                {rejecting ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
