import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@wolfchow/auth'
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Clock,
  Users,
  CreditCard,
  Bell,
  Tag,
  Megaphone,
  ArrowLeftRight,
  Puzzle,
  Settings,
  Menu as MenuIcon,
  X,
  Flame,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: React.ElementType; end?: boolean }

const NAV_GROUPS: Array<{ items: NavItem[] }> = [
  {
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/orders', label: 'Orders', icon: ShoppingBag },
    ],
  },
  {
    items: [
      { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
      { to: '/hours', label: 'Hours & Scheduling', icon: Clock },
      { to: '/staff', label: 'Staff', icon: Users },
    ],
  },
  {
    items: [
      { to: '/payments', label: 'Payments', icon: CreditCard },
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/promotions', label: 'Promotions', icon: Tag },
      { to: '/notices', label: 'Notices', icon: Megaphone },
      { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    ],
  },
  {
    items: [
      { to: '/integrations', label: 'Integrations', icon: Puzzle },
      { to: '/settings', label: 'Settings', icon: Settings },
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close drawer on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className={cn('admin-sidebar', sidebarOpen && 'admin-sidebar--open')}>
        {/* Brand */}
        <div className="admin-sidebar__brand">
          <div className="admin-sidebar__brand-mark" aria-hidden>
            <Flame size={14} color="white" strokeWidth={2.5} />
          </div>
          <div>
            <div className="admin-sidebar__brand-name">Wolfchow</div>
            <div className="admin-sidebar__brand-sub">Admin</div>
          </div>
          {/* Mobile close */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="admin-sidebar__close"
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav */}
        <nav className="admin-nav" aria-label="Main navigation">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="admin-nav__group">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn('admin-nav__item', isActive && 'admin-nav__item--active')
                    }
                  >
                    <Icon size={15} className="admin-nav__icon" aria-hidden />
                    {item.label}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__avatar" aria-hidden>
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

      {/* Mobile overlay backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={cn('admin-overlay', sidebarOpen && 'admin-overlay--visible')}
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      {/* ── Content panel ── */}
      <div className="admin-content">
        {/* Mobile top bar */}
        <div className="admin-topbar">
          <button
            type="button"
            className="admin-topbar__hamburger"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
            aria-expanded={sidebarOpen}
          >
            <MenuIcon size={20} />
          </button>
          <span className="admin-topbar__brand">Wolfchow</span>
        </div>

        {/* Page content */}
        <main className="admin-main">
          <div className="admin-main__inner">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
