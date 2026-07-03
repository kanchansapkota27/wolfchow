import { useQuery } from '@tanstack/react-query'
import { formatCurrency } from '@wolfchow/utils'
import { ApiError } from '@wolfchow/api-client'
import { useApi } from '../lib/api'
import { MetricCard, MetricCardSkeleton } from '../components/MetricCard'
import { SectionError } from '../components/SectionError'
import { PageHeader } from '../components/PageHeader'

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return `${err.status}: ${err.message}`
  if (err instanceof TypeError && err.message.includes('fetch'))
    return 'Cannot reach API — is the Worker running on localhost:8789?'
  if (err instanceof Error) return err.message
  return 'Failed to load'
}

interface SummaryRow {
  total_orders_30d?: number | string
  estimated_commission_30d?: number | string
}

const sum = (rows: SummaryRow[], key: keyof SummaryRow): number =>
  rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)

export function Dashboard() {
  const api = useApi()
  const { status, data, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const [billing, active] = await Promise.all([
        api.superadmin.getBilling(),
        api.superadmin.listRestaurants({ active: true }),
      ])
      return {
        summary: (billing.summary ?? []) as SummaryRow[],
        activeCount: active.total,
      }
    },
  })

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Platform overview at a glance." />

      {status === 'pending' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <MetricCardSkeleton key={index} />
          ))}
        </div>
      ) : status === 'error' || !data ? (
        <SectionError message={toMessage(error)} onRetry={() => void refetch()} />
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
