import { useAuth } from '@wolfchow/auth'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function firstName(email: string | undefined): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  const part = local.split(/[._-]/)[0] ?? local
  return part.charAt(0).toUpperCase() + part.slice(1)
}

export function Dashboard() {
  const { user } = useAuth()
  const name = firstName(user?.email)

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        {greeting()}{name ? `, ${name}` : ''}.
      </h1>
      <p className="mt-1 text-sm text-gray-500">Here's what's happening with your restaurant today.</p>

      <div className="mt-8 grid grid-cols-3 gap-4">
        {[
          { label: 'Orders today', value: '—' },
          { label: 'Revenue today', value: '—' },
          { label: 'Avg. ticket', value: '—' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white/60 p-6 text-center text-sm text-gray-400">
        Live metrics coming in STORY-057
      </div>
    </div>
  )
}
