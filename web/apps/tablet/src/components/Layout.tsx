import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { TabBar } from './TabBar'
import { ConnectionBadge } from './ConnectionBadge'
import { EventBanners } from './EventBanners'
import { useApi } from '../lib/api'

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

function HeartbeatEffect() {
  const api = useApi()

  useEffect(() => {
    // Send immediately on mount, then every 5 minutes
    void api.orders.heartbeat().catch(() => {})
    const id = setInterval(() => {
      void api.orders.heartbeat().catch(() => {})
    }, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [api])

  return null
}

export function Layout() {
  return (
    <RequireRole
      roles={['kitchen', 'tablet_device']}
      fallback={
        <div className="flex h-full items-center justify-center bg-gray-900">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-green-500" />
        </div>
      }
    >
      <div className="relative flex h-full flex-col bg-gray-900 text-gray-100">
        <HeartbeatEffect />

        {/* Header strip with connection indicator */}
        <header className="flex items-center justify-end border-b border-gray-700/60 px-3 py-1.5">
          <ConnectionBadge />
        </header>

        {/* Event banners overlay */}
        <EventBanners />

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </RequireRole>
  )
}
