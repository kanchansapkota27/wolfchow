import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../lib/api'

interface HistoryItem {
  item_name: string | null
  variant_name: string | null
  quantity: number
}

interface HistoryOrder {
  id: string
  status: string
  total: number
  payment_method: string
  customer_name: string
  created_at: string
  items: HistoryItem[]
}

interface HistoryResponse {
  orders: HistoryOrder[]
  total: number
  page: number
  page_size: number
  history_days: number
}

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: 'Completed', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  rejected:  { label: 'Rejected',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  missed:    { label: 'Missed',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function shortId(id: string): string {
  return `#${id.slice(-4).toUpperCase()}`
}

export function OrderHistory() {
  const api = useApi()
  const [data, setData] = useState<HistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await api.orders.getOrderHistory(p)
      setData(res)
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load(page) }, [load, page])

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 1

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--md-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--md-outline-var)' }}
      >
        <div>
          <h2
            className="font-bold"
            style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 18, color: 'var(--md-on-surface)' }}
          >
            Order History
          </h2>
          {data && (
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--md-outline)', marginTop: 2 }}>
              Last {data.history_days} days · {data.total} orders
            </p>
          )}
        </div>
        {loading && (
          <div
            className="h-5 w-5 animate-spin rounded-full border-2"
            style={{ borderColor: 'var(--md-surface-ch)', borderTopColor: 'var(--md-secondary)' }}
          />
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {!loading && data?.orders.length === 0 && (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            <span className="text-5xl opacity-20">📋</span>
            <p className="text-sm" style={{ color: 'var(--md-outline)' }}>No history in this period</p>
          </div>
        )}

        {data?.orders.map((order) => {
          const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.completed
          const itemCount = order.items.reduce((s, i) => s + i.quantity, 0)
          const summary = order.items
            .slice(0, 2)
            .map((i) => i.item_name ?? i.variant_name ?? 'Item')
            .join(', ')
          const overflow = order.items.length > 2 ? ` +${order.items.length - 2} more` : ''

          return (
            <div
              key={order.id}
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: 'var(--md-outline-var)' }}
            >
              {/* Status dot */}
              <div
                className="shrink-0 rounded-full"
                style={{ width: 8, height: 8, background: cfg.color }}
              />

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--md-on-surface)', fontWeight: 700 }}
                  >
                    {shortId(order.id)}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-bold"
                    style={{ background: cfg.bg, color: cfg.color, fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}
                  >
                    {cfg.label}
                  </span>
                </div>
                <p
                  className="mt-0.5 font-semibold truncate"
                  style={{ fontSize: 14, color: 'var(--md-on-surface)' }}
                >
                  {order.customer_name}
                </p>
                <p
                  className="mt-0.5 truncate"
                  style={{ fontSize: 12, color: 'var(--md-outline)' }}
                >
                  {itemCount} item{itemCount !== 1 ? 's' : ''} · {summary}{overflow}
                </p>
              </div>

              {/* Right side */}
              <div className="text-right shrink-0">
                <p
                  className="font-bold"
                  style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--md-on-surface)' }}
                >
                  ${Number(order.total).toFixed(2)}
                </p>
                <p
                  style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--md-outline)', marginTop: 2 }}
                >
                  {timeAgo(order.created_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between px-4 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--md-outline-var)' }}
        >
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1 || loading}
            className="rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30"
            style={{
              background: 'var(--md-surface-c)',
              color: 'var(--md-on-surface)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
            }}
          >
            ← PREV
          </button>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--md-outline)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-30"
            style={{
              background: 'var(--md-surface-c)',
              color: 'var(--md-on-surface)',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 12,
            }}
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  )
}
