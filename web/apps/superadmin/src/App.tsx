import { Route, Routes } from 'react-router'
import { RequireRole } from '@wolfchow/auth'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Placeholder } from './pages/Placeholder'

/**
 * Superadmin route tree. The whole app is gated to platform roles; the section
 * pages other than the dashboard are placeholders until STORY-050–055 land.
 * The surrounding Router + providers live in main.tsx (and in tests).
 */
export function App() {
  return (
    <RequireRole
      roles={['superadmin', 'support']}
      fallback={<div className="p-8 text-gray-100">Loading…</div>}
    >
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="restaurants" element={<Placeholder title="Restaurants" story="STORY-050" />} />
          <Route path="plans" element={<Placeholder title="Plans" story="STORY-051" />} />
          <Route path="invites" element={<Placeholder title="Invites" story="STORY-052" />} />
          <Route path="smtp" element={<Placeholder title="SMTP" story="STORY-053" />} />
          <Route path="billing" element={<Placeholder title="Billing" story="STORY-054" />} />
          <Route path="audit" element={<Placeholder title="Audit Log" story="STORY-055" />} />
        </Route>
      </Routes>
    </RequireRole>
  )
}
