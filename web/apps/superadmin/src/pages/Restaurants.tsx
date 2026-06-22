import { useState } from 'react'
import { Badge, Input } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { Plus } from 'lucide-react'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { CreateRestaurantModal } from '../components/CreateRestaurantModal'
import { PageHeader } from '../components/PageHeader'

export function Restaurants() {
  const api = useApi()
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const plansAsync = useAsync(() => api.superadmin.listPlans(), [api])
  const list = useAsync(
    () =>
      api.superadmin.listRestaurants({
        search: search || undefined,
        plan_id: planFilter || undefined,
        active: statusFilter || undefined,
      }),
    [api, search, planFilter, statusFilter],
  )

  const plans = plansAsync.data?.plans ?? []
  const rows = list.data?.restaurants ?? []

  return (
    <div>
      <PageHeader
        title="Restaurants"
        subtitle="Manage all tenants on the platform."
        action={
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={16} />
            Create Restaurant
          </button>
        }
      />

      {/* Filters */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input
            label="Search"
            placeholder="Name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Plan</span>
            <select
              aria-label="Filter by plan"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Status</span>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Suspended</option>
            </select>
          </label>
        </div>
      </div>

      {list.status === 'error' && <SectionError onRetry={list.reload} />}

      {list.status !== 'error' && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Slug</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Plan</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Orders 30d</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Commission</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Billing Note</th>
                  <th className="px-4 py-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                      {list.status === 'loading' ? 'Loading…' : 'No restaurants found.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.id)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{r.slug}</code>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.display_name}</td>
                      <td className="px-4 py-3">
                        {r.plan_name ? <Badge variant="indigo">{r.plan_name}</Badge> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={r.active ? 'green' : 'red'}>
                          {r.active ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.order_count_30d}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {r.override_commission_value !== null
                          ? r.override_commission_type === 'fixed'
                            ? `$${(r.override_commission_value / 100).toFixed(2)}/mo ↑`
                            : `${(r.override_commission_value / 100).toFixed(2)}% ↑`
                          : 'Plan default'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.billing_note ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(r.created_at, 'UTC')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <RestaurantDetail
          restaurantId={selected}
          plans={plans}
          onClose={() => setSelected(null)}
          onChanged={() => list.reload()}
        />
      )}

      <CreateRestaurantModal
        open={createOpen}
        plans={plans}
        onClose={() => setCreateOpen(false)}
        onCreated={() => list.reload()}
      />
    </div>
  )
}
