import { Button } from '@wolfchow/ui'
import { useAuth } from './context'

export interface ImpersonationBannerProps {
  /** Display name of the restaurant being viewed. */
  restaurantName?: string
}

/**
 * Persistent top bar shown while a superadmin is impersonating a tenant. The
 * Exit action clears the impersonation token and returns to the superadmin
 * panel. Renders nothing when not impersonating.
 */
export function ImpersonationBanner({ restaurantName }: ImpersonationBannerProps) {
  const { isImpersonating, exitImpersonation } = useAuth()
  if (!isImpersonating) return null
  return (
    <div className="wc-imp-banner" role="alert">
      <span>Viewing as {restaurantName ?? 'restaurant'}</span>
      <Button variant="ghost" onClick={exitImpersonation}>
        Exit
      </Button>
    </div>
  )
}
