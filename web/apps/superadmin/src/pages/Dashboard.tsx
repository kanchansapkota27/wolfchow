import { formatCurrency } from '@wolfchow/utils'
import { useApi } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { MetricCard, MetricCardSkeleton } from '../components/MetricCard'
import { SectionError } from '../components/SectionError'

interface SummaryRow {
  total_orders_30d?: number | string
  estimated_commission_30d?: number | string
}

const sum = (rows: SummaryRow[], key: keyof SummaryRow): number =>
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)

/** Platform home: four summary cards over the billing summary + active count. */
export function Dashboard() {
  const api = useApi()
  const { status, data, reload } = useAsync(async () => {
    const [billing, active] = await Promise.all([
      api.superadmin.getBilling(),
      api.superadmin.listRestaurants({ active: true }),
    ])
    return {
      summary: (billing.summary ?? []) as SummaryRow[],
      activeCount: active.total,
    }
  }, [api])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>

      {status === 'loading' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <MetricCardSkeleton key={index} />
          ))}
        </div>
      ) : status === 'error' || !data ? (
        <SectionError onRetry={reload} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total restaurants" value={data.summary.length} />
          <MetricCard label="Active restaurants" value={data.activeCount} />
          <MetricCard label="Orders (30d)" value={sum(data.summary, 'total_orders_30d')} />
          <MetricCard
            label="Est. commission (30d)"
            value={formatCurrency(sum(data.summary, 'estimated_commission_30d'), 'TRY')}
          />
        </div>
      )}
    </div>
  )
}
