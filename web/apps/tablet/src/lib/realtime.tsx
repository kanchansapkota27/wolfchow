import type { ReactNode } from 'react'
import { RealtimeProvider as SharedRealtimeProvider } from '@wolfchow/realtime'
import { useAuth } from '@wolfchow/auth'

export { useRealtime } from '@wolfchow/realtime'
export type { RealtimeStatus, RealtimeEventHandler, RealtimeContextValue } from '@wolfchow/realtime'

/**
 * Thin wrapper around `@wolfchow/realtime`'s provider that supplies
 * `restaurantId` from the authenticated session. The widget and tracking
 * apps use the shared provider directly since they have no auth context.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { restaurantId } = useAuth()
  return <SharedRealtimeProvider restaurantId={restaurantId}>{children}</SharedRealtimeProvider>
}
