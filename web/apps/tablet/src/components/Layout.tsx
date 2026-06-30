import { useEffect, useState } from 'react'
import { Outlet } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { TabBar } from './TabBar'
import { ConnectionBadge } from './ConnectionBadge'
import { EventBanners } from './EventBanners'
import { useApi } from '../lib/api'
import { useRealtime } from '../lib/realtime'

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

function useLiveClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

function HeartbeatEffect() {
  const api = useApi()
  useEffect(() => {
    void api.orders.heartbeat().catch(() => {})
    const id = setInterval(() => void api.orders.heartbeat().catch(() => {}), HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [api])
  return null
}

// Track pending new-order count via realtime events without re-subscribing
// to the full order list (that is done by the page components).
function useNewOrderCount() {
  const [count, setCount] = useState(0)
  const { subscribe } = useRealtime()

  useEffect(() => {
    const unsubs = [
      subscribe('new_order', () => setCount((n) => n + 1)),
      subscribe('order_accepted', () => setCount((n) => Math.max(0, n - 1))),
      subscribe('order_rejected', () => setCount((n) => Math.max(0, n - 1))),
    ]
    return () => unsubs.forEach((u) => u())
  }, [subscribe])

  return count
}

function Header() {
  const clock = useLiveClock()
  const newCount = useNewOrderCount()

  const timeStr = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = clock.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b px-5 py-2.5"
      style={{ background: '#080d17', borderColor: '#1e293b' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl text-xl"
          style={{ background: '#f97316' }}
        >
          🍽
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">Kitchen Display</p>
          <p className="text-xs leading-tight" style={{ color: '#475569' }}>Order Management</p>
        </div>
      </div>

      {/* Clock */}
      <div className="text-center">
        <p className="text-2xl font-bold tabular-nums text-white leading-tight">{timeStr}</p>
        <p className="text-xs" style={{ color: '#475569' }}>{dateStr}</p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        {newCount > 0 && (
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)' }}
          >
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: '#f97316' }} />
            {newCount} new
          </div>
        )}
        <ConnectionBadge />
      </div>
    </header>
  )
}

export function Layout() {
  return (
    <RequireRole
      roles={['kitchen', 'tablet_device']}
      fallback={
        <div className="flex h-full items-center justify-center" style={{ background: '#080d17' }}>
          <div
            className="h-10 w-10 animate-spin rounded-full border-4"
            style={{ borderColor: '#1e293b', borderTopColor: '#f97316' }}
          />
        </div>
      }
    >
      <div className="relative flex h-full flex-col" style={{ background: '#080d17', color: '#f1f5f9' }}>
        <HeartbeatEffect />
        <Header />
        <EventBanners />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
        <TabBar />
      </div>
    </RequireRole>
  )
}
