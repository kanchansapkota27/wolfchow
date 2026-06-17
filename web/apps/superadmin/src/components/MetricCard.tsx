import type { ReactNode } from 'react'

export interface MetricCardProps {
  label: string
  value: ReactNode
}

/** A single dashboard summary card. */
export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-50">{value}</p>
    </div>
  )
}

/** Placeholder card shown while metrics load. */
export function MetricCardSkeleton() {
  return (
    <div
      data-testid="skeleton-card"
      className="h-[92px] animate-pulse rounded-lg border border-gray-800 bg-gray-900"
    />
  )
}
