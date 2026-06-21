import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@wolfchow/auth'

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/orders', label: 'Orders' },
  { to: '/menu', label: 'Menu' },
  { to: '/hours', label: 'Hours & Scheduling' },
  { to: '/staff', label: 'Staff' },
  { to: '/payments', label: 'Payments' },
  { to: '/notifications', label: 'Notifications' },
  { to: '/promotions', label: 'Promotions' },
  { to: '/notices', label: 'Notices' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/integrations', label: 'Integrations' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight text-gray-900">
          Wolfchow
        </div>
        <nav className="flex-1 px-2 pb-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-2 text-sm font-medium',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-200 px-3 py-4 text-sm">
          <p className="truncate px-2 text-gray-500">{user?.email ?? 'Signed in'}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 w-full rounded-md px-3 py-2 text-left text-gray-600 hover:bg-gray-100"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
