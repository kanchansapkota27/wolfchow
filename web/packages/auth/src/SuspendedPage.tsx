import { Button } from '@wolfchow/ui'
import { useAuth } from './context'

/** Shown when the signed-in account's restaurant has been suspended. */
export function SuspendedPage() {
  const { logout } = useAuth()
  return (
    <div className="wc-suspended" role="alert">
      <h1>Account suspended</h1>
      <p>Your account has been suspended. Contact support.</p>
      <Button variant="secondary" onClick={() => void logout()}>
        Log out
      </Button>
    </div>
  )
}
