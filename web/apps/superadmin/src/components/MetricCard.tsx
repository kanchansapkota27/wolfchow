import type { ReactNode } from 'react'

export interface MetricCardProps {
  label: string
  value: ReactNode
}

/** A single dashboard summary card. */
export function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

/** Placeholder card shown while metrics load. */
export function MetricCardSkeleton() {
  return (
    <div
      data-testid="skeleton-card"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
      <div className="mt-3 h-8 w-16 animate-pulse rounded bg-gray-200" />
    </div>
  )
}
