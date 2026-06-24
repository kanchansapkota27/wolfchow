import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Signup } from './pages/Signup'
import { Settings } from './pages/Settings'
import { Hours } from './pages/Hours'
import { Menu } from './pages/Menu'
import { Notifications } from './pages/Notifications'
import { Staff } from './pages/Staff'
import { Promotions } from './pages/Promotions'
import { Notices } from './pages/Notices'
import { Transactions } from './pages/Transactions'
import { Integrations } from './pages/Integrations'
import { Orders } from './pages/Orders'
import { SmtpSettings } from './pages/SmtpSettings'

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
        <Route path="orders" element={<Orders />} />
        <Route path="menu" element={<Menu />} />
        <Route path="hours" element={<Hours />} />
        <Route path="staff" element={<Staff />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="promotions" element={<Promotions />} />
        <Route path="notices" element={<Notices />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="smtp" element={<SmtpSettings />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
