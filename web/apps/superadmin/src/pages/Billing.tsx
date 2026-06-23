import { useCallback, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BillingMonthRow, BillingSummaryRow } from '@wolfchow/types'
import { Button, Modal, useToast } from '@wolfchow/ui'
import { Download } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../lib/api'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

/** Generic numeric money display — billing summary doesn't carry per-restaurant currency. */
function fmtMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

function exportCsv(rows: BillingSummaryRow[]) {
  const header = [
    'Restaurant', 'Slug', 'Commission', 'Billing Note',
    'Orders (all)', 'GMV (all)', 'Orders (30d)', 'GMV (30d)', 'Est. Commission (30d)',
  ].join(',')
  const lines = rows.map((r) =>
    [
      csvCell(r.display_name),
      csvCell(r.slug),
      csvCell(
        r.effective_commission_type === 'fixed'
          ? `$${(r.effective_commission_value / 100).toFixed(2)}/mo`
          : `${(r.effective_commission_value / 100).toFixed(2)}%`,
      ),
      csvCell(r.billing_note ?? ''),
      csvCell(r.total_orders),
      csvCell(Number(r.total_order_value).toFixed(2)),
      csvCell(r.total_orders_30d),
      csvCell(Number(r.total_order_value_30d).toFixed(2)),
      csvCell(Number(r.estimated_commission_30d).toFixed(2)),
    ].join(','),
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `billing-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Inline billing note editor ────────────────────────────────────────────────

interface BillingNoteCellProps {
  restaurantId: string
  initialNote: string | null
  onSaved: (note: string | null) => void
}

function BillingNoteCell({ restaurantId, initialNote, onSaved }: BillingNoteCellProps) {
  const api = useApi()
  const { notify } = useToast()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialNote ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api.superadmin.updateRestaurant(restaurantId, {
        billing_note: value.trim() || null,
      })
      onSaved(value.trim() || null)
      setEditing(false)
    } catch {
      notify('error', 'Failed to save billing note.')
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    setValue(initialNote ?? '')
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Click to edit billing note"
        onClick={() => setEditing(true)}
        className="group flex w-full items-center gap-1 text-left"
      >
        <span className={initialNote ? 'text-gray-600' : 'text-gray-400 italic'}>
          {initialNote ?? 'add note…'}
        </span>
        <span className="hidden text-gray-400 group-hover:inline">✏️</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="w-full rounded border border-gray-200 bg-white px-2 py-0.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') cancel()
        }}
        disabled={busy}
        data-testid="billing-note-input"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="shrink-0 text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
      >
        {busy ? '…' : '✓'}
      </button>
      <button
        type="button"
        onClick={cancel}
        className="shrink-0 text-xs text-gray-500 hover:text-gray-700"
      >
        ✕
      </button>
    </div>
  )
}

// ── Monthly drilldown modal ───────────────────────────────────────────────────

interface MonthlyDetailModalProps {
  restaurantId: string | null
  restaurantName: string
  commissionType: string
  commissionValue: number
  onClose: () => void
}

function MonthlyDetailModal({
  restaurantId,
  restaurantName,
  commissionType,
  commissionValue,
  onClose,
}: MonthlyDetailModalProps) {
  const api = useApi()
  const { status: monthlyStatus, data: monthlyData } = useQuery({
    queryKey: ['restaurant-billing', restaurantId],
    queryFn: () => api.superadmin.getRestaurantBilling(restaurantId!),
    enabled: restaurantId !== null,
  })

  const chartData = (monthlyData?.months ?? []).map((m) => ({
    month: new Date(m.month).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
    'GMV': Number(m.order_value),
    'Commission': Number(m.estimated_commission),
    order_count: m.order_count,
  })).reverse()

  return (
    <Modal open={restaurantId !== null} onClose={onClose} title={`${restaurantName} — Monthly`}>
      <div className="min-h-[320px]">
        {monthlyStatus === 'pending' && (
          <p className="py-8 text-center text-gray-400">Loading…</p>
        )}
        {monthlyStatus === 'error' && (
          <SectionError onRetry={() => {}} />
        )}
        {monthlyStatus === 'success' && chartData.length === 0 && (
          <p className="py-8 text-center text-gray-500">No captured orders yet.</p>
        )}
        {monthlyStatus === 'success' && chartData.length > 0 && (
          <>
            <p className="mb-4 text-sm text-gray-500">
              Commission:{' '}
              <strong className="text-gray-900">
                {commissionType === 'fixed'
                  ? `$${(commissionValue / 100).toFixed(2)}/mo flat`
                  : `${(commissionValue / 100).toFixed(2)}% of monthly sales`}
              </strong>
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} width={60} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 6 }}
                  labelStyle={{ color: '#111827' }}
                  itemStyle={{ color: '#374151' }}
                />
                <Legend wrapperStyle={{ color: '#6b7280', fontSize: 12 }} />
                <Bar dataKey="GMV" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Commission" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 overflow-x-auto overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-3 py-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">Month</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">Orders</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">GMV</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {(monthlyData?.months ?? []).map((m) => (
                    <tr key={m.month} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-900">
                        {new Date(m.month).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{m.order_count}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">
                        {fmtMoney(Number(m.order_value))}
                      </td>
                      <td className="px-3 py-1.5 text-right text-green-600">
                        {fmtMoney(Number(m.estimated_commission))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Billing() {
  const api = useApi()
  const { status, data, error } = useQuery({
    queryKey: ['billing'],
    queryFn: () => api.superadmin.getBilling(),
  })

  // Local billing_note state so inline edits update immediately without re-fetch
  const [notes, setNotes] = useState<Record<string, string | null>>({})
  const [drilldown, setDrilldown] = useState<BillingSummaryRow | null>(null)

  const rows = data?.summary ?? []
  const getNote = useCallback(
    (row: BillingSummaryRow) => (row.id in notes ? notes[row.id]! : row.billing_note),
    [notes],
  )

  const totals = rows.reduce(
    (acc, r) => ({
      orders30d: acc.orders30d + Number(r.total_orders_30d),
      gmv30d: acc.gmv30d + Number(r.total_order_value_30d),
      commission30d: acc.commission30d + Number(r.estimated_commission_30d),
    }),
    { orders30d: 0, gmv30d: 0, commission30d: 0 },
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Commission"
        subtitle={data?.cached ? 'Cached — refreshes every 5 min' : 'Per-restaurant commission and order volume.'}
        action={
          <button
            type="button"
            disabled={rows.length === 0}
            onClick={() => exportCsv(rows)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={15} />
            Export CSV
          </button>
        }
      />

      {/* Totals row */}
      {status === 'success' && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Orders (30d)', value: totals.orders30d.toLocaleString() },
            { label: 'GMV (30d)', value: fmtMoney(totals.gmv30d) },
            { label: 'Est. Commission (30d)', value: fmtMoney(totals.commission30d) },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500">{card.label}</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {status === 'pending' && <p className="text-gray-400">Loading…</p>}
      {status === 'error' && <SectionError message={String(error)} onRetry={() => {}} />}

      {status === 'success' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Restaurant</th>
                <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                <th className="px-4 py-3 min-w-[160px] text-xs font-semibold tracking-wider text-gray-500 uppercase">Billing Note</th>
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">Orders 30d</th>
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">GMV 30d</th>
                <th className="px-4 py-3 text-right text-xs font-semibold tracking-wider text-gray-500 uppercase">Est. Commission 30d</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No restaurants yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{r.display_name}</div>
                      <div className="text-xs text-gray-500">{r.slug}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {r.effective_commission_type === 'fixed'
                        ? `$${(r.effective_commission_value / 100).toFixed(2)}/mo`
                        : `${(r.effective_commission_value / 100).toFixed(2)}%`}
                    </td>
                    <td className="px-4 py-2">
                      <BillingNoteCell
                        restaurantId={r.id}
                        initialNote={getNote(r)}
                        onSaved={(note) => setNotes((n) => ({ ...n, [r.id]: note }))}
                      />
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{r.total_orders_30d}</td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {fmtMoney(Number(r.total_order_value_30d))}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">
                      {fmtMoney(Number(r.estimated_commission_30d))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" onClick={() => setDrilldown(r)}>
                        Details
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <MonthlyDetailModal
        restaurantId={drilldown?.id ?? null}
        restaurantName={drilldown?.display_name ?? ''}
        commissionType={drilldown?.effective_commission_type ?? 'percentage'}
        commissionValue={drilldown?.effective_commission_value ?? 0}
        onClose={() => setDrilldown(null)}
      />
    </div>
  )
}
