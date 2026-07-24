import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { AlertTriangle } from 'lucide-react'
import { useApi } from '../lib/api'
import { isDeviceOnline } from '../lib/deviceStatus'

// Poll independently of any per-page device fetch — this banner needs to
// stay accurate across every page in the app, not just the Devices page.
const POLL_MS = 60_000

/**
 * Warns when no tablet device has sent a heartbeat recently — without this,
 * a kitchen with every tablet logged out (or crashed, or offline) keeps
 * accepting orders with no one able to see them, and nothing in the admin
 * UI would otherwise surface that.
 */
export function DeviceOfflineBanner() {
  const api = useApi()

  const { data } = useQuery({
    queryKey: ['devices', 'online-status'],
    queryFn: () => api.admin.listDevices(),
    refetchInterval: POLL_MS,
    staleTime: POLL_MS,
  })

  if (!data) return null

  const anyOnline = data.devices.some((d) => isDeviceOnline(d.last_seen_at))
  if (anyOnline) return null

  const message = data.devices.length === 0
    ? "No kitchen tablet has ever been set up — incoming orders won't be seen in the kitchen."
    : "No kitchen tablet is currently online — incoming orders may not be seen."

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle size={18} className="shrink-0 text-amber-600" />
      <p className="min-w-0 flex-1 text-sm font-medium text-amber-800">{message}</p>
      <Link
        to="/devices"
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100"
      >
        Manage devices
      </Link>
    </div>
  )
}
