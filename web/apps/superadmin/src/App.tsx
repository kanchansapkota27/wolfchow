import { Button } from '@wolfchow/ui'
import { formatCurrency } from '@wolfchow/utils'

/**
 * Placeholder shell for the superadmin app, scaffolded in STORY-047. It imports the
 * shared UI and utils packages to verify the monorepo wiring; real screens
 * arrive in later frontend stories.
 */
export function App() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Wolfchow — Superadmin control panel (Slice 1)</h1>
      <p>Scaffolded in STORY-047. Example shared helper: {formatCurrency(1234.5, 'TRY')}</p>
      <Button variant="primary">Get started</Button>
    </main>
  )
}
