import { NavLink } from 'react-router'

interface Tab {
  to: string
  label: string
  icon: string
  end?: boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Queue', icon: '📋', end: true },
  { to: '/active', label: 'Active', icon: '🔥' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
  { to: '/pause', label: 'Pause', icon: '⏸' },
]

export function TabBar() {
  return (
    <nav className="flex border-t border-gray-700 bg-gray-900">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            [
              'flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              isActive ? 'text-indigo-400' : 'text-gray-400 hover:text-gray-200',
            ].join(' ')
          }
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
