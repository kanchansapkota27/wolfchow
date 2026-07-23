import { useState, useEffect, useMemo } from 'react'
import { Button } from '@wolfchow/ui'
import { useApi } from '../lib/api'
import { OrderDetailBreakdown } from '../components/orders/OrderDetailBreakdown'
import type { TransactionRow, RefundInput, RefundReason } from '@wolfchow/api-client'

const STATUS_BADGE: Record<string, string> = {
  completed:       'bg-green-100 text-green-700',
  refunded:        'bg-purple-100 text-purple-700',
  rejected:        'bg-red-100 text-red-700',
  missed:          'bg-orange-100 text-orange-700',
  accepted:        'bg-blue-100 text-blue-700',
  preparing:       'bg-indigo-100 text-indigo-700',
  ready:           'bg-teal-100 text-teal-700',
  pending_payment: 'bg-gray-100 text-gray-600',
  auth_success:    'bg-gray-100 text-gray-600',
}

function money(n: number): string {
  return `$${Number(n).toFixed(2)}`
}

const REASON_LABELS: Record<RefundReason, string> = {
  duplicate: 'Duplicate',
  fraudulent: 'Fraudulent',
  requested_by_customer: 'Requested by customer',
}

// ── Refund Modal ──────────────────────────────────────────────────────────────

interface RefundModalProps {
  tx: TransactionRow
  onConfirm: (data: RefundInput) => Promise<void>
  onClose: () => void
}

function RefundModal({ tx, onConfirm, onClose }: RefundModalProps) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amountStr, setAmountStr] = useState('')
  const [reason, setReason] = useState<RefundReason>('requested_by_customer')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const maxDollars = Number(tx.total)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'partial') {
      const entered = parseFloat(amountStr)
      if (isNaN(entered) || entered <= 0) { setError('Enter a valid amount'); return }
      if (entered > maxDollars) { setError(`Amount cannot exceed ${money(maxDollars)}`); return }
    }
    setSubmitting(true)
    try {
      const amountCents = mode === 'partial' ? Math.round(parseFloat(amountStr) * 100) : undefined
      await onConfirm({ amount_cents: amountCents, reason })
      onClose()
    } catch {
      setError('Refund failed — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" role="dialog" aria-label="Refund order">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Refund order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close refund">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === 'full'} onChange={() => setMode('full')} className="text-indigo-600" />
              <span className="text-sm text-gray-700">Full refund <span className="text-gray-500">({money(maxDollars)})</span></span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={mode === 'partial'} onChange={() => setMode('partial')} className="text-indigo-600" />
              <span className="text-sm text-gray-700">Partial refund</span>
            </label>
          </div>
          {mode === 'partial' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={maxDollars}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                required
                className="border border-gray-200 rounded-md px-3 py-2 text-sm w-36 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                aria-label="Refund amount"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RefundReason)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
              aria-label="Refund reason"
            >
              {(Object.entries(REASON_LABELS) as Array<[RefundReason, string]>).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
            <Button loading={submitting} type="submit">Confirm refund</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Detail slide-over ─────────────────────────────────────────────────────────

interface DetailPanelProps {
  tx: TransactionRow
  onRefund: (id: string, data: RefundInput) => Promise<void>
  onClose: () => void
}

function DetailPanel({ tx, onRefund, onClose }: DetailPanelProps) {
  const [showRefundModal, setShowRefundModal] = useState(false)
  const isCard = tx.stripe_intent_id !== null
  const alreadyRefunded = tx.refund_id !== null

  async function handleRefund(data: RefundInput) {
    await onRefund(tx.id, data)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" aria-label="Transaction detail">
      <div className="fixed inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md shadow-xl p-6 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Order #{tx.id.slice(0, 8).toUpperCase()}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close detail">✕</button>
        </div>
        <dl className="text-sm space-y-2">
          <div><dt className="text-gray-500">Customer</dt><dd className="font-medium">{tx.customer_name} ({tx.customer_email})</dd></div>
          <div><dt className="text-gray-500">Status</dt><dd><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[tx.status] ?? 'bg-gray-100 text-gray-600'}`}>{tx.status}</span></dd></div>
          <div><dt className="text-gray-500">Total</dt><dd className="font-medium">{money(tx.total)}</dd></div>
          <div><dt className="text-gray-500">Date</dt><dd>{new Date(tx.created_at).toLocaleString()}</dd></div>
          {isCard && (
            <div><dt className="text-gray-500">Stripe intent</dt><dd className="font-mono text-xs break-all">{tx.stripe_intent_id}</dd></div>
          )}
          {alreadyRefunded && (
            <div>
              <dt className="text-gray-500">Refund ID</dt>
              <dd className="font-mono text-xs break-all">{tx.refund_id}</dd>
              {tx.refunded_at && <dd className="text-xs text-gray-400">at {new Date(tx.refunded_at).toLocaleString()}</dd>}
            </div>
          )}
        </dl>
        <div className="border-t border-gray-100 pt-3">
          <OrderDetailBreakdown order={tx} />
        </div>
        <div className="pt-2">
          {!isCard ? (
            <p className="text-sm text-gray-500 italic">Cash order — no refund available</p>
          ) : alreadyRefunded ? (
            <p className="text-sm text-gray-500 italic">This order has been refunded</p>
          ) : (
            <Button onClick={() => setShowRefundModal(true)}>Issue refund</Button>
          )}
        </div>
        {showRefundModal && (
          <RefundModal tx={tx} onConfirm={handleRefund} onClose={() => setShowRefundModal(false)} />
        )}
      </div>
    </div>
  )
}

// ── Main Transactions page ────────────────────────────────────────────────────

export function Transactions() {
  const api = useApi()
  const [txs, setTxs] = useState<TransactionRow[]>([])
  const [historyDays, setHistoryDays] = useState<number>(30)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TransactionRow | null>(null)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    void api.admin.listTransactions({ page: 1 }).then((res) => {
      setTxs(res.transactions)
      setHistoryDays(res.history_days)
    }).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return txs.filter((t) => {
      if (q && !t.customer_name.toLowerCase().includes(q) && !t.customer_email.toLowerCase().includes(q)) return false
      if (fromDate && t.created_at < fromDate) return false
      if (toDate && t.created_at > toDate + 'T23:59:59Z') return false
      return true
    })
  }, [txs, search, fromDate, toDate])

  async function handleRefund(id: string, data: RefundInput) {
    // The backend only returns the changed fields — merge into the existing
    // row rather than replace it, or items/tax/tip/notes would be wiped out.
    const partial = await api.admin.refundTransaction(id, data)
    setTxs((prev) => prev.map((t) => t.id === id ? { ...t, ...partial } : t))
    if (selected?.id === id) setSelected((s) => s && { ...s, ...partial })
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>

  return (
    <div className="p-8 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">Transactions</h2>

      {historyDays === 30 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          Showing last 30 days. Upgrade for full history.
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search customer name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-200 rounded-md px-3 py-2 text-sm flex-1 min-w-48 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          aria-label="Search transactions"
        />
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="From date" />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" aria-label="To date" />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
          No transactions found
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Order ID</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Payment</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer"
                  aria-label={`Transaction ${t.id.slice(0, 8).toUpperCase()}`}
                >
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{t.id.slice(0, 8).toUpperCase()}</td>
                  <td className="px-4 py-3 text-gray-700 max-w-40 truncate">{t.customer_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.stripe_intent_id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                      {t.stripe_intent_id ? 'Card' : 'Cash'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{money(t.total)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DetailPanel tx={selected} onRefund={handleRefund} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
