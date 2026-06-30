import { NavLink } from 'react-router'

interface Tab { to: string; label: string; icon: string; end?: boolean }

const TABS: Tab[] = [
  { to: '/',          label: 'Orders',    icon: '📋', end: true },
  { to: '/active',   label: 'Kitchen',   icon: '🔥' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
  { to: '/pause',    label: 'Pause',     icon: '⏸' },
]

export function TabBar() {
  return (
    <nav className="flex border-t" style={{ background: '#080d17', borderColor: '#1e293b' }}>
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            [
              'relative flex flex-1 flex-col items-center gap-1 py-3.5 text-xs font-semibold transition-colors',
              isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <span
                  className="absolute inset-x-4 top-0 h-0.5 rounded-b-full"
                  style={{ background: '#f97316' }}
                />
              )}
              <span className="text-[22px] leading-none">{tab.icon}</span>
              <span className="tracking-wide uppercase text-[10px]">{tab.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
