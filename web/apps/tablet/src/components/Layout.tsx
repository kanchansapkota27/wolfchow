import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { EventBanners } from './EventBanners'
import { ConnectionBadge } from './ConnectionBadge'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

const HEARTBEAT_MS = 5 * 60 * 1000

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useLiveClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

function useNewOrderCount() {
  const [count, setCount] = useState(0)
  const { subscribe } = useRealtime()
  useEffect(() => {
    const unsubs = [
      subscribe('new_order',      () => setCount((n) => n + 1)),
      subscribe('order_accepted', () => setCount((n) => Math.max(0, n - 1))),
      subscribe('order_rejected', () => setCount((n) => Math.max(0, n - 1))),
    ]
    return () => unsubs.forEach((u) => u())
  }, [subscribe])
  return count
}

function HeartbeatEffect() {
  const api = useApi()
  useEffect(() => {
    void api.orders.heartbeat().catch(() => {})
    const id = setInterval(() => void api.orders.heartbeat().catch(() => {}), HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [api])
  return null
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: Array<{ to: string; icon: string; label: string; end?: boolean }> = [
  { to: '/',          icon: 'pending_actions', label: 'Live Orders', end: true },
  { to: '/active',    icon: 'restaurant_menu', label: 'Kitchen' },
  { to: '/inventory', icon: 'inventory_2',     label: 'Inventory' },
]

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SIDEBAR_EXPANDED = 268
const SIDEBAR_COLLAPSED = 68

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  newCount: number
  paused: boolean
}

function Sidebar({ collapsed, onToggle, newCount, paused }: SidebarProps) {
  const navigate = useNavigate()
  const w = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED

  return (
    <aside
      className="fixed left-0 top-0 h-screen z-50 flex flex-col justify-between overflow-hidden"
      style={{
        width: w,
        transition: 'width 240ms cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--md-surface-sidebar)',
        borderRight: '1px solid var(--md-outline-var)',
      }}
    >
      {/* Top: brand + nav */}
      <div className="flex flex-col overflow-hidden">
        {/* Brand row */}
        <div
          className="flex items-center justify-between px-4 py-5"
          style={{ minHeight: 72 }}
        >
          {!collapsed && (
            <div className="flex-1 min-w-0 pr-2">
              <p
                className="font-bold truncate leading-tight"
                style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 18, color: 'var(--md-on-surface)' }}
              >
                KITCHEN OPS
              </p>
              <p
                className="text-xs truncate mt-0.5"
                style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--md-outline)', letterSpacing: '0.05em' }}
              >
                Station 01
              </p>
            </div>
          )}
          <button
            onClick={onToggle}
            className="shrink-0 flex items-center justify-center rounded-lg transition-colors"
            style={{
              width: 36, height: 36,
              background: 'transparent',
              color: 'var(--md-on-surface-var)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--md-surface-ch)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {collapsed ? 'menu' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="px-3 space-y-1">
          {NAV_ITEMS.map(({ to, icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={!!end}
              className={({ isActive }) =>
                `flex items-center gap-3.5 rounded-lg transition-colors relative ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'} ${isActive ? '' : ''}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--md-surface-ch)' : 'transparent',
                color: isActive ? 'var(--md-secondary)' : 'var(--md-on-surface-var)',
                borderLeft: isActive ? `3px solid var(--md-secondary)` : '3px solid transparent',
              })}
              onMouseEnter={(e) => {
                if (!(e.currentTarget.getAttribute('aria-current'))) {
                  e.currentTarget.style.background = 'var(--md-surface-c)'
                }
              }}
              onMouseLeave={(e) => {
                if (!(e.currentTarget.getAttribute('aria-current'))) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
              title={collapsed ? label : undefined}
            >
              <span
                className="material-symbols-outlined shrink-0"
                style={{ fontSize: 22 }}
              >
                {icon}
              </span>
              {!collapsed && (
                <span
                  className="truncate font-bold"
                  style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, letterSpacing: '0.04em' }}
                >
                  {label}
                </span>
              )}
              {/* New order badge on Live Orders nav item */}
              {to === '/' && newCount > 0 && (
                <span
                  className="shrink-0 rounded-full flex items-center justify-center font-bold"
                  style={{
                    minWidth: 20, height: 20, padding: '0 5px',
                    background: 'var(--md-secondary)',
                    color: 'var(--md-on-secondary)',
                    fontSize: 11,
                    marginLeft: collapsed ? undefined : 'auto',
                  }}
                >
                  {newCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Bottom: pause + support */}
      <div className="px-3 pb-5 space-y-2">
        <button
          onClick={() => void navigate('/pause')}
          className="w-full rounded-lg font-bold transition-all active:scale-95"
          style={{
            background: paused ? 'rgba(147,0,10,0.3)' : 'var(--md-error-c)',
            color: paused ? 'var(--md-error)' : 'var(--md-on-error-c)',
            border: `1px solid ${paused ? 'var(--md-error)' : 'transparent'}`,
            padding: collapsed ? '12px 0' : '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 13, letterSpacing: '0.04em',
          }}
          title={collapsed ? (paused ? 'ORDERS PAUSED' : 'PAUSE ORDERS') : undefined}
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20 }}>
            {paused ? 'play_arrow' : 'pause_circle'}
          </span>
          {!collapsed && (paused ? 'RESUME ORDERS' : 'PAUSE ORDERS')}
        </button>

        <button
          className="w-full rounded-lg transition-colors"
          style={{
            background: 'transparent',
            color: 'var(--md-on-surface-var)',
            padding: collapsed ? '10px 0' : '10px 12px',
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--md-surface-c)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={collapsed ? 'Support' : undefined}
        >
          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 20 }}>help</span>
          {!collapsed && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, letterSpacing: '0.04em' }}>
              Support
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  sidebarW: number
  paused: boolean
}

function TopBar({ sidebarW, paused }: TopBarProps) {
  const clock = useLiveClock()
  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <header
      className="fixed top-0 right-0 z-40 flex items-center justify-between h-12 px-6"
      style={{
        left: sidebarW,
        background: 'var(--md-surface)',
        borderBottom: '1px solid var(--md-outline-var)',
        transition: 'left 240ms cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* Brand */}
      <span
        className="font-black tracking-tighter"
        style={{ fontFamily: "'Hanken Grotesk',sans-serif", fontSize: 22, color: 'var(--md-primary)' }}
      >
        KitchenCommand
      </span>

      {/* Right cluster */}
      <div className="flex items-center gap-5">
        {/* Clock */}
        <span
          className="tabular-nums font-bold"
          style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, color: 'var(--md-on-surface-var)' }}
        >
          {timeStr}
        </span>

        <div style={{ width: 1, height: 20, background: 'var(--md-outline-var)' }} />

        {/* Connection badge */}
        <ConnectionBadge />

        <div style={{ width: 1, height: 20, background: 'var(--md-outline-var)' }} />

        {/* Store status */}
        <div className="flex items-center gap-2">
          <span
            className="font-bold"
            style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, letterSpacing: '0.05em', color: paused ? 'var(--md-error)' : 'var(--md-secondary)' }}
          >
            {paused ? 'ORDERS PAUSED' : 'STORE OPEN'}
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full pulse-dot"
            style={{ background: paused ? 'var(--md-error)' : 'var(--md-secondary)' }}
          />
        </div>
      </div>
    </header>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const [paused, setPaused] = useState(false)
  const newCount = useNewOrderCount()
  const { subscribe } = useRealtime()

  // Track pause state from realtime
  useEffect(() => {
    return subscribe('pause_state_changed', (_, payload) => {
      setPaused(Boolean(payload.paused))
    })
  }, [subscribe])

  const sidebarW = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED

  return (
    <RequireRole
      roles={['kitchen', 'tablet_device']}
      fallback={
        <div className="flex h-full items-center justify-center" style={{ background: 'var(--md-bg)' }}>
          <div
            className="h-10 w-10 animate-spin rounded-full border-4"
            style={{ borderColor: 'var(--md-surface-ch)', borderTopColor: 'var(--md-secondary)' }}
          />
        </div>
      }
    >
      <div className="relative flex h-full" style={{ background: 'var(--md-bg)', color: 'var(--md-on-surface)' }}>
        <HeartbeatEffect />

        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          newCount={newCount}
          paused={paused}
        />

        {/* Main area: offset by sidebar, below topbar */}
        <div
          className="flex-1 flex flex-col min-h-0"
          style={{
            marginLeft: sidebarW,
            transition: 'margin-left 240ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <TopBar sidebarW={sidebarW} paused={paused} />

          <main
            className="flex-1 overflow-hidden"
            style={{ marginTop: 48 }}
          >
            <Outlet />
          </main>
        </div>

        <EventBanners />
      </div>
    </RequireRole>
  )
}
