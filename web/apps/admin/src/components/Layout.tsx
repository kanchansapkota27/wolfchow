import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '@wolfchow/auth'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Clock,
  Tablet,
  Bell,
  Tag,
  Megaphone,
  Mail,
  Puzzle,
  Settings,
  LogOut,
  Menu as MenuIcon,
  Store,
} from 'lucide-react'
import { useApi } from '../lib/api'
import { useEffect } from 'react'
import { DeviceOfflineBanner } from './DeviceOfflineBanner'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/hours', label: 'Hours', icon: Clock },
  { to: '/devices', label: 'Devices', icon: Tablet },
  { to: '/promotions', label: 'Promotions', icon: Tag },
  { to: '/notices', label: 'Notices', icon: Megaphone },
  { to: '/smtp', label: 'SMTP Settings', icon: Mail },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/integrations', label: 'Integrations', icon: Puzzle },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

function initials(email: string | undefined): string {
  if (!email) return '?'
  const [local] = email.split('@')
  const parts = (local ?? '').split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  return (local ?? '?').slice(0, 2).toUpperCase()
}

export function Layout() {
  const { user, logout } = useAuth()
  const api = useApi()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  const { data: restaurant } = useQuery({
    queryKey: ['restaurant'],
    queryFn: () => api.admin.getRestaurant(),
    staleTime: 5 * 60_000,
  })

  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const email = user?.email ?? undefined

  const sidebarContent = (
    <div className="flex h-full w-64 flex-col bg-[#1e2235]">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-sm font-bold text-white">
          R
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Restro Admin</p>
          {restaurant?.slug && (
            <p className="truncate text-[11px] text-gray-400">/{restaurant.slug}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
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
            {initials(email)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm text-white" title={email}>{email ?? 'Signed in'}</p>
            <p className="text-[10px] font-semibold tracking-widest text-gray-400 uppercase">Administrator</p>
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
            <MenuIcon size={20} />
          </button>
          <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
            Restaurant Operations
          </span>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-[11px] font-bold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Live
            </span>
            <Store size={18} className="text-gray-400" />
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          <DeviceOfflineBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
