import { useAuth } from '@wolfchow/auth'

export function Dashboard() {
  const { user } = useAuth()
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">Welcome back{user?.email ? `, ${user.email}` : ''}.</p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
        Orders, revenue, and activity overview coming in STORY-057.
      </div>
    </div>
  )
}
