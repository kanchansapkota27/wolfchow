import { useState } from 'react'
import type { AuditEntry } from '@wolfchow/types'
import { Badge, Button } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'

const TABLE_OPTIONS = [
  'restaurants', 'plans', 'invites', 'users', 'menu_categories',
  'menu_items', 'modifier_groups', 'modifier_options', 'orders',
  'smtp_configs', 'device_tokens',
]

const OPERATION_OPTIONS = ['INSERT', 'UPDATE', 'DELETE', 'IMPERSONATION_START', 'IMPERSONATION_END']

type OperationVariant = 'green' | 'yellow' | 'red' | 'indigo' | 'gray'

function operationVariant(op: string): OperationVariant {
  if (op === 'INSERT') return 'green'
  if (op === 'UPDATE') return 'yellow'
  if (op === 'DELETE') return 'red'
  if (op.startsWith('IMPERSONATION')) return 'indigo'
  return 'gray'
}

function operationLabel(op: string): string {
  if (op === 'IMPERSONATION_START') return 'Impersonation ▶'
  if (op === 'IMPERSONATION_END') return 'Impersonation ■'
  return op
}

// ── JSON diff panel ────────────────────────────────────────────────────────────

function DiffPanel({ old_data, new_data }: { old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null }) {
  const allKeys = [...new Set([
    ...Object.keys(old_data ?? {}),
    ...Object.keys(new_data ?? {}),
  ])].filter((k) => {
    const ov = JSON.stringify((old_data ?? {})[k])
    const nv = JSON.stringify((new_data ?? {})[k])
    return ov !== nv
  })

  if (allKeys.length === 0 && !new_data) {
    return <p className="py-2 text-xs text-gray-500">No data recorded.</p>
  }

  if (allKeys.length === 0) {
    return (
      <div className="space-y-1 text-xs">
        <p className="text-gray-500">No field changes detected.</p>
        {new_data && (
          <pre className="mt-2 overflow-x-auto rounded bg-gray-950 p-2 text-gray-400">
            {JSON.stringify(new_data, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="pb-1 pr-4 font-medium">Field</th>
          <th className="pb-1 pr-4 font-medium text-red-400">Before</th>
          <th className="pb-1 font-medium text-green-400">After</th>
        </tr>
      </thead>
      <tbody>
        {allKeys.map((key) => (
          <tr key={key} className="border-t border-gray-800">
            <td className="py-1 pr-4 font-mono text-gray-400">{key}</td>
            <td className="py-1 pr-4 font-mono text-red-300">
              {old_data && key in old_data
                ? <span className="rounded bg-red-950/60 px-1">{JSON.stringify((old_data)[key])}</span>
                : <span className="text-gray-600">—</span>}
            </td>
            <td className="py-1 font-mono text-green-300">
              {new_data && key in new_data
                ? <span className="rounded bg-green-950/60 px-1">{JSON.stringify((new_data)[key])}</span>
                : <span className="text-gray-600">—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Audit() {
  const api = useApi()
  const [restaurantFilter, setRestaurantFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const auditQ = useAsync(
    () =>
      api.superadmin.listAudit({
        restaurant_id: restaurantFilter || undefined,
        table_name: tableFilter || undefined,
        operation: operationFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
      }),
    [api, restaurantFilter, tableFilter, operationFilter, dateFrom, dateTo, page],
  )

  const entries: AuditEntry[] = auditQ.data?.entries ?? []
  const total = auditQ.data?.total ?? 0
  const pageSize = auditQ.data?.page_size ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function applyFilter() {
    setPage(1)
    auditQ.reload()
  }

  function toggleRow(id: string) {
    setExpanded((cur) => (cur === id ? null : id))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit Log</h1>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900 p-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Restaurant ID</label>
          <input
            aria-label="Filter by restaurant ID"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
            value={restaurantFilter}
            onChange={(e) => setRestaurantFilter(e.target.value)}
            placeholder="UUID or empty"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Table</label>
          <select
            aria-label="Filter by table"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="">All tables</option>
            {TABLE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Operation</label>
          <select
            aria-label="Filter by operation"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
            value={operationFilter}
            onChange={(e) => setOperationFilter(e.target.value)}
          >
            <option value="">All operations</option>
            {OPERATION_OPTIONS.map((op) => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Date from</label>
          <input
            type="date"
            aria-label="Date from"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Date to</label>
          <input
            type="date"
            aria-label="Date to"
            className="rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div className="col-span-full flex items-center gap-3">
          <Button onClick={applyFilter} variant="secondary">Apply filters</Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRestaurantFilter('')
              setTableFilter('')
              setOperationFilter('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
          >
            Clear
          </Button>
          {auditQ.status === 'success' && (
            <span className="ml-auto text-xs text-gray-500">
              {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
      </div>

      {auditQ.status === 'loading' && <p className="text-gray-400">Loading…</p>}
      {auditQ.status === 'error' && <SectionError onRetry={auditQ.reload} />}

      {auditQ.status === 'success' && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-900 text-gray-400">
                <tr>
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Restaurant</th>
                  <th className="px-4 py-2">Table</th>
                  <th className="px-4 py-2">Operation</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No audit entries match your filters.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <>
                      <tr
                        key={e.id}
                        className="cursor-pointer border-t border-gray-800 hover:bg-gray-800/40"
                        onClick={() => toggleRow(e.id)}
                        aria-expanded={expanded === e.id}
                      >
                        <td className="px-4 py-2 text-gray-400 whitespace-nowrap">
                          {formatDate(e.created_at, 'UTC')}
                        </td>
                        <td className="px-4 py-2 text-gray-300">
                          <code className="text-xs">{e.restaurant_id ?? '—'}</code>
                        </td>
                        <td className="px-4 py-2 text-gray-300">
                          {e.table_name ?? <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={operationVariant(e.operation)}>
                            {operationLabel(e.operation)}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-gray-400">
                          {e.user_name ?? <span className="text-gray-600">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-500">
                          {expanded === e.id ? '▲' : '▼'}
                        </td>
                      </tr>
                      {expanded === e.id && (
                        <tr key={`${e.id}-diff`} className="border-t border-gray-800 bg-gray-900/60">
                          <td colSpan={6} className="px-6 py-3">
                            <DiffPanel old_data={e.old_data} new_data={e.new_data} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </Button>
              <Button
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
