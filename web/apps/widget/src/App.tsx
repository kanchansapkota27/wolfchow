import type { PublicSettings } from '@wolfchow/api-client'

export type WidgetState = 'loading' | 'ready' | 'error'

interface AppProps {
  state: WidgetState
  settings: PublicSettings | null
}

export function App({ state, settings }: AppProps) {
  if (state === 'error') {
    return (
      <div
        role="alert"
        style={{
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'var(--font-family, system-ui, sans-serif)',
          color: 'var(--brand-text, #111)',
        }}
      >
        Menu temporarily unavailable
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="Loading menu"
        style={{
          padding: '2rem',
          fontFamily: 'var(--font-family, system-ui, sans-serif)',
        }}
      >
        <div data-testid="skeleton" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: '1.25rem',
                borderRadius: '0.25rem',
                background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
                width: i === 3 ? '60%' : '100%',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '1.5rem',
        fontFamily: 'var(--font-family, system-ui, sans-serif)',
        color: 'var(--brand-text, #111)',
      }}
    >
      <h1
        style={{
          fontSize: '1.5rem',
          fontWeight: 700,
          color: 'var(--brand-primary, #111)',
          margin: '0 0 1rem',
        }}
      >
        {settings?.display_name ?? 'Our Menu'}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Menu coming soon.</p>
    </div>
  )
}
