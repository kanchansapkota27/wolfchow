import type { OrderStatus } from '@wolfchow/types'

/** A semantic color token (maps to Tailwind `b-*` palette in the apps). */
export type StatusColor =
  | 'gray'
  | 'blue'
  | 'amber'
  | 'indigo'
  | 'green'
  | 'red'
  | 'purple'

export interface StatusDisplay {
  label: string
  color: StatusColor
}

/**
 * Human label + display color for every customer-facing order status. Exhaustive
 * over `OrderStatus` (a missing key is a compile error), so the apps and the
 * tracking page render every state consistently.
 */
export const orderStatusLabel: Record<OrderStatus, StatusDisplay> = {
  pending_payment: { label: 'Pending payment', color: 'gray' },
  auth_success: { label: 'Awaiting confirmation', color: 'blue' },
  accepted: { label: 'Accepted', color: 'indigo' },
  preparing: { label: 'Preparing', color: 'amber' },
  ready: { label: 'Ready', color: 'green' },
  completed: { label: 'Completed', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  missed: { label: 'Missed', color: 'red' },
  refunded: { label: 'Refunded', color: 'purple' },
}
