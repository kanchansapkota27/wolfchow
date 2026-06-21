import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@wolfchow/auth'

const NAV_GROUPS: Array<{ items: Array<{ to: string; label: string; end?: boolean }> }> = [
  {
    items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/orders', label: 'Orders' },
    ],
  },
  {
    items: [
      { to: '/menu', label: 'Menu' },
      { to: '/hours', label: 'Hours & Scheduling' },
      { to: '/staff', label: 'Staff' },
    ],
  },
  {
    items: [
      { to: '/payments', label: 'Payments' },
      { to: '/notifications', label: 'Notifications' },
      { to: '/promotions', label: 'Promotions' },
      { to: '/notices', label: 'Notices' },
      { to: '/transactions', label: 'Transactions' },
    ],
  },
  {
    items: [
      { to: '/integrations', label: 'Integrations' },
      { to: '/settings', label: 'Settings' },
    ],
  },
]

function initials(email: string | undefined): string {
  if (!email) return '?'
  const [local] = email.split('@')
  const parts = (local ?? '').split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return (local ?? '?').slice(0, 2).toUpperCase()
}

export function Layout() {
  const { user, logout } = useAuth()
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="admin-sidebar">
        {/* Brand */}
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-mark">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M6 1L10 5H8V11H4V5H2L6 1Z" fill="white" />
            </svg>
          </div>
          <div>
            <div className="admin-sidebar__brand-name">Wolfchow</div>
            <div className="admin-sidebar__brand-sub">Admin</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="admin-nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="admin-nav__group">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    ['admin-nav__item', isActive ? 'admin-nav__item--active' : ''].filter(Boolean).join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__avatar" aria-hidden="true">
            {initials(user?.email)}
          </div>
          <div className="admin-sidebar__user">
            <div className="admin-sidebar__email" title={user?.email}>
              {user?.email ?? 'Signed in'}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="admin-sidebar__signout"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-main__inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
