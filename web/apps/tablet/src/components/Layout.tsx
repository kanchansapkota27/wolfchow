import { Outlet } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { TabBar } from './TabBar'
import { ConnectionBadge } from './ConnectionBadge'
import { EventBanners } from './EventBanners'

export function Layout() {
  return (
    <RequireRole
      roles={['kitchen', 'tablet_device']}
      fallback={<div className="flex h-full items-center justify-center text-gray-400">Loading…</div>}
    >
      <div className="relative flex h-full flex-col bg-gray-900 text-gray-100">
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
