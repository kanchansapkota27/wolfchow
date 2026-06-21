import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Signup } from './pages/Signup'
import { Settings } from './pages/Settings'
import { Hours } from './pages/Hours'
import { Menu } from './pages/Menu'
import { Notifications } from './pages/Notifications'
import { Payments } from './pages/Payments'
import { Staff } from './pages/Staff'
import { Promotions } from './pages/Promotions'
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
        <Route path="menu" element={<Menu />} />
        <Route path="hours" element={<Hours />} />
        <Route path="staff" element={<Staff />} />
        <Route path="payments" element={<Payments />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="notices" element={<Placeholder title="Notices" story="STORY-064" />} />
        <Route path="transactions" element={<Placeholder title="Transactions" story="STORY-065" />} />
        <Route path="integrations" element={<Placeholder title="Integrations" story="STORY-066" />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
