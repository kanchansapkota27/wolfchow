import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Signup } from './pages/Signup'
import { Settings } from './pages/Settings'
import { Placeholder } from './pages/Placeholder'

function ProtectedLayout() {
  return (
    <RequireRole
      roles={['restaurant_owner', 'kitchen']}
      fallback={<div className="p-8 text-gray-500">Loading…</div>}
    >
      <Layout />
    </RequireRole>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage methods={['staff']} />} />
      <Route path="/signup" element={<Signup />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Placeholder title="Orders" story="STORY-057" />} />
        <Route path="menu" element={<Placeholder title="Menu" story="STORY-058" />} />
        <Route path="hours" element={<Placeholder title="Hours & Scheduling" story="STORY-059" />} />
        <Route path="staff" element={<Placeholder title="Staff" story="STORY-060" />} />
        <Route path="payments" element={<Placeholder title="Payments" story="STORY-061" />} />
        <Route path="notifications" element={<Placeholder title="Notifications" story="STORY-062" />} />
        <Route path="promotions" element={<Placeholder title="Promotions" story="STORY-063" />} />
        <Route path="notices" element={<Placeholder title="Notices" story="STORY-064" />} />
        <Route path="transactions" element={<Placeholder title="Transactions" story="STORY-065" />} />
        <Route path="integrations" element={<Placeholder title="Integrations" story="STORY-066" />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
