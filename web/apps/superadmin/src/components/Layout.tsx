import { NavLink, Outlet } from 'react-router'
import { ImpersonationBanner, useAuth } from '@wolfchow/auth'

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/restaurants', label: 'Restaurants' },
  { to: '/plans', label: 'Plans' },
  { to: '/invites', label: 'Invites' },
  { to: '/smtp', label: 'SMTP' },
  { to: '/billing', label: 'Billing' },
  { to: '/audit', label: 'Audit Log' },
]

/** Dark sidebar shell. Section content renders through the router `Outlet`. */
export function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <aside className="flex w-60 flex-col border-r border-gray-800 bg-gray-900">
        <div className="px-5 py-5 text-lg font-semibold tracking-tight">RestroAPI</div>
        <nav className="flex-1 px-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'block rounded-md px-3 py-2 text-sm',
                  isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-100',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-800 px-3 py-4 text-sm">
          <p className="truncate px-2 text-gray-400">{user?.email ?? user?.role ?? 'Signed in'}</p>
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-2 w-full rounded-md px-3 py-2 text-left text-gray-300 hover:bg-gray-800"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1">
        <ImpersonationBanner />
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
