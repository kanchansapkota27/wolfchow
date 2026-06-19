import { useState } from 'react'
import { Badge, Button, Input } from '@wolfchow/ui'
import { formatDate } from '@wolfchow/utils'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { SectionError } from '../components/SectionError'
import { RestaurantDetail } from '../components/RestaurantDetail'
import { CreateRestaurantModal } from '../components/CreateRestaurantModal'

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <Button onClick={() => setCreateOpen(true)}>Create restaurant</Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input
          label="Search restaurants"
          placeholder="Name or slug"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">Plan</span>
          <select
            aria-label="Filter by plan"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
          >
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">Status</span>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Suspended</option>
          </select>
        </label>
      </div>

      {list.status === 'error' && <SectionError onRetry={list.reload} />}

      {list.status !== 'error' && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 text-gray-400">
              <tr>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Plan</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Orders 30d</th>
                <th className="px-4 py-2">Commission</th>
                <th className="px-4 py-2">Billing note</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                    {list.status === 'loading' ? 'Loading…' : 'No restaurants'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className="cursor-pointer border-t border-gray-800 hover:bg-gray-800/60"
                  >
                    <td className="px-4 py-2">
                      <code className="text-gray-300">{r.slug}</code>
                    </td>
                    <td className="px-4 py-2">{r.display_name}</td>
                    <td className="px-4 py-2">
                      {r.plan_name ? <Badge variant="indigo">{r.plan_name}</Badge> : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={r.active ? 'green' : 'red'}>
                        {r.active ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{r.order_count_30d}</td>
                    <td className="px-4 py-2">{+(r.commission_rate * 100).toFixed(2)}%</td>
                    <td className="px-4 py-2 text-gray-400">{r.billing_note ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-400">{formatDate(r.created_at, 'UTC')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
