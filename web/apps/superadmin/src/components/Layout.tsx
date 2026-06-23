import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import {
  LayoutDashboard,
  Store,
  CreditCard,
  UserPlus,
  Mail,
  BarChart2,
  ClipboardList,
  Settings,
  LogOut,
  Menu,
} from 'lucide-react'
import { ImpersonationBanner, useAuth } from '@wolfchow/auth'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/restaurants', label: 'Restaurants', icon: Store },
  { to: '/plans', label: 'Plans', icon: CreditCard },
  { to: '/invites', label: 'Invites', icon: UserPlus },
  { to: '/smtp', label: 'SMTP', icon: Mail },
  { to: '/billing', label: 'Billing', icon: BarChart2 },
  { to: '/audit', label: 'Audit Log', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Layout() {
  const { user, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const initial = (user?.email?.[0] ?? 'S').toUpperCase()

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-[#1e2235]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 font-bold text-white text-sm">
          R
        </div>
        <span className="text-lg font-semibold text-white">Restro SA</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest ? rest.end : undefined}
            onClick={() => setDrawerOpen(false)}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:bg-white/10 hover:text-white',
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-3 flex items-center gap-3 px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600 text-sm font-semibold text-white">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white">{user?.email ?? 'Signed in'}</p>
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">
              {user?.role ?? 'superadmin'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Desktop sidebar — always visible ≥ md */}
      <aside className="hidden md:flex md:shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-30 flex md:hidden">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
          <button
            type="button"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
            Platform Management
          </span>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          <ImpersonationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
