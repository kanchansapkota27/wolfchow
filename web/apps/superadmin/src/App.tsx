import { Route, Routes } from 'react-router'
import { LoginPage, RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Plans } from './pages/Plans'
import { Placeholder } from './pages/Placeholder'

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
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="restaurants" element={<Placeholder title="Restaurants" story="STORY-050" />} />
        <Route path="plans" element={<Plans />} />
        <Route path="invites" element={<Placeholder title="Invites" story="STORY-052" />} />
        <Route path="smtp" element={<Placeholder title="SMTP" story="STORY-053" />} />
        <Route path="billing" element={<Placeholder title="Billing" story="STORY-054" />} />
        <Route path="audit" element={<Placeholder title="Audit Log" story="STORY-055" />} />
      </Route>
    </Routes>
  )
}
