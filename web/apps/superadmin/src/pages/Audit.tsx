import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import type { AuditEntry, RestaurantListItem } from '@wolfchow/types'
import { Badge } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useQuery } from '@tanstack/react-query'
import { useApi } from '../lib/api'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

const TABLE_OPTIONS = [
  'auth', 'restaurants', 'plans', 'invites', 'users',
  'menu_categories', 'menu_items', 'modifier_groups', 'modifier_options',
  'orders', 'smtp_configs', 'device_tokens',
]

const OPERATION_OPTIONS = [
  'INSERT', 'UPDATE', 'DELETE',
  'LOGIN', 'LOGOUT', 'DEVICE_LOGIN',
  'IMPERSONATION_START', 'IMPERSONATION_END',
]

type BadgeVariant = 'green' | 'amber' | 'red' | 'indigo' | 'gray'

function operationVariant(op: string): BadgeVariant {
  if (op === 'INSERT' || op === 'LOGIN' || op === 'DEVICE_LOGIN') return 'green'
  if (op === 'UPDATE') return 'amber'
  if (op === 'DELETE' || op === 'LOGOUT') return 'red'
  if (op.startsWith('IMPERSONATION')) return 'indigo'
  return 'gray'
}

function operationLabel(op: string): string {
  if (op === 'IMPERSONATION_START') return 'Impersonation ▶'
  if (op === 'IMPERSONATION_END') return 'Impersonation ■'
  if (op === 'DEVICE_LOGIN') return 'Device Login'
  return op.charAt(0) + op.slice(1).toLowerCase()
}

function DiffPanel({
  old_data,
  new_data,
}: {
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
}) {
  const changedKeys = useMemo(() => {
    const keys = [...new Set([...Object.keys(old_data ?? {}), ...Object.keys(new_data ?? {})])]
    return keys.filter((k) => JSON.stringify((old_data ?? {})[k]) !== JSON.stringify((new_data ?? {})[k]))
  }, [old_data, new_data])

  if (changedKeys.length === 0 && !new_data) {
    return <p className="py-2 text-xs text-gray-400">No data recorded.</p>
  }

  if (changedKeys.length === 0) {
    return (
      <div className="text-xs">
        <p className="mb-2 text-gray-500">No field changes detected.</p>
        {new_data && (
          <pre className="overflow-x-auto rounded-lg bg-gray-100 p-3 text-gray-600">
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
          <th className="pb-1 pr-4 font-medium text-red-500">Before</th>
          <th className="pb-1 font-medium text-green-600">After</th>
        </tr>
      </thead>
      <tbody>
        {changedKeys.map((key) => (
          <tr key={key} className="border-t border-gray-200">
            <td className="py-1 pr-4 font-mono text-gray-600">{key}</td>
            <td className="py-1 pr-4 font-mono text-red-600">
              {old_data && key in old_data ? (
                <span className="rounded bg-red-50 px-1">{JSON.stringify((old_data)[key])}</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
            <td className="py-1 font-mono text-green-700">
              {new_data && key in new_data ? (
                <span className="rounded bg-green-50 px-1">{JSON.stringify((new_data)[key])}</span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Audit() {
  const api = useApi()

  const { data: restaurantsData } = useQuery({
    queryKey: ['audit-restaurants'],
    queryFn: () => api.superadmin.listRestaurants({ page_size: 500 }),
    staleTime: 5 * 60 * 1000,
  })
  const restaurants: RestaurantListItem[] = restaurantsData?.restaurants ?? []
  const restaurantMap = useMemo(
    () => new Map(restaurants.map((r) => [r.id, r])),
    [restaurants],
  )

  const [restaurantFilter, setRestaurantFilter] = useState('')
  const [tableFilter, setTableFilter] = useState('')
  const [operationFilter, setOperationFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { status: auditStatus, data: auditData } = useQuery({
    queryKey: ['audit', { restaurantFilter, tableFilter, operationFilter, dateFrom, dateTo, page }],
    queryFn: () =>
      api.superadmin.listAudit({
        restaurant_id: restaurantFilter || undefined,
        table_name: tableFilter || undefined,
        operation: operationFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
      }),
  })

  const allEntries: AuditEntry[] = auditData?.entries ?? []
  const entries = search
    ? allEntries.filter(
        (e) =>
          e.id.toLowerCase().includes(search.toLowerCase()) ||
          e.operation.toLowerCase().includes(search.toLowerCase()),
      )
    : allEntries
  const total = auditData?.total ?? 0
  const pageSize = auditData?.page_size ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, total)

  function toggleRow(id: string) {
    setExpanded((cur) => (cur === id ? null : id))
  }

  function clearFilters() {
    setRestaurantFilter('')
    setTableFilter('')
    setOperationFilter('')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setPage(1)
  }

  const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform Audit Log"
        subtitle="Every administrative action across the platform is tracked here."
      />

      {/* Filter card */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {/* Row 1: search + table + operation */}
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by record ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select aria-label="Filter by table" className={selectClass} value={tableFilter} onChange={(e) => { setTableFilter(e.target.value); setPage(1) }}>
            <option value="">All Tables</option>
            {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select aria-label="Filter by operation" className={selectClass} value={operationFilter} onChange={(e) => { setOperationFilter(e.target.value); setPage(1) }}>
            <option value="">All Operations</option>
            {OPERATION_OPTIONS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
        </div>

        {/* Row 2: restaurant + dates + clear */}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <select aria-label="Filter by restaurant" className={selectClass} value={restaurantFilter} onChange={(e) => { setRestaurantFilter(e.target.value); setPage(1) }}>
            <option value="">All Restaurants</option>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
          </select>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date from</label>
            <input type="date" aria-label="Date from" className={selectClass} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Date to</label>
            <input type="date" aria-label="Date to" className={selectClass} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          <button type="button" onClick={clearFilters} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Clear
          </button>
          {auditStatus === 'success' && (
            <span className="ml-auto text-xs text-gray-400">
              {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
      </div>

      {auditStatus === 'pending' && <p className="text-sm text-gray-500">Loading…</p>}
      {auditStatus === 'error' && <SectionError />}

      {auditStatus === 'success' && (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Restaurant</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Table</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Operation</th>
                    <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">User</th>
                    <th className="px-4 py-3 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        No audit entries match your filters.
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => {
                      const rest = e.restaurant_id ? restaurantMap.get(e.restaurant_id) : null
                      return (
                        <Fragment key={e.id}>
                          <tr
                            className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                            onClick={() => toggleRow(e.id)}
                            aria-expanded={expanded === e.id}
                          >
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {formatDate(e.created_at, 'UTC')}
                            </td>
                            <td className="px-4 py-3">
                              {rest ? (
                                <div>
                                  <span className="font-medium text-gray-900">{rest.display_name}</span>
                                  <div className="text-xs text-gray-400">{e.restaurant_id}</div>
                                </div>
                              ) : e.restaurant_id ? (
                                <code className="text-xs text-gray-500">{e.restaurant_id}</code>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-700">
                              {e.table_name ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={operationVariant(e.operation)}>
                                {operationLabel(e.operation)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {e.user_name ?? <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400">
                              {expanded === e.id
                                ? <ChevronUp size={15} />
                                : <ChevronDown size={15} />}
                            </td>
                          </tr>
                          {expanded === e.id && (
                            <tr className="border-b border-gray-100 bg-gray-50">
                              <td colSpan={6} className="px-6 py-4">
                                <DiffPanel old_data={e.old_data} new_data={e.new_data} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {pageStart} to {pageEnd} of {total.toLocaleString()} entries
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
