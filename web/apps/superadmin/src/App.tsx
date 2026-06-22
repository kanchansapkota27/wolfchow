import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Plans } from './pages/Plans'
import { Invites } from './pages/Invites'
import { Restaurants } from './pages/Restaurants'
import { Smtp } from './pages/Smtp'
import { Billing } from './pages/Billing'
import { Audit } from './pages/Audit'
import { Settings } from './pages/Settings'

function ProtectedLayout() {
  return (
    <RequireRole
      roles={['superadmin', 'support']}
      fallback={<div className="p-8 text-gray-600">Loading…</div>}
    >
      <Layout />
    </RequireRole>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage methods={['staff']} />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="restaurants" element={<Restaurants />} />
        <Route path="plans" element={<Plans />} />
        <Route path="invites" element={<Invites />} />
        <Route path="smtp" element={<Smtp />} />
        <Route path="billing" element={<Billing />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
