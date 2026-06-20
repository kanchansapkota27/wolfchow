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

/** Gate + shell: only platform roles get in; others are bounced to /login. */
function ProtectedLayout() {
  return (
    <RequireRole
      roles={['superadmin', 'support']}
      fallback={<div className="p-8 text-gray-100">Loading…</div>}
    >
      <Layout />
    </RequireRole>
  )
}

/**
 * Superadmin route tree. `/login` is public; everything else sits behind the
 * role gate. Section pages other than the dashboard and plans are placeholders
 * until STORY-050/052–055 land. The Router + providers live in main.tsx (and in
 * tests).
 */
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
      </Route>
    </Routes>
  )
}
