import { Outlet } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { TabBar } from './TabBar'

export function Layout() {
  return (
    <RequireRole
      roles={['kitchen', 'tablet_device']}
      fallback={<div className="flex h-full items-center justify-center text-gray-400">Loading…</div>}
    >
      <div className="flex h-full flex-col bg-gray-900 text-gray-100">
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </RequireRole>
  )
}
