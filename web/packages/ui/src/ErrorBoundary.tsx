import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of the default full-page fallback when set. */
  fallback?: ReactNode
  /** Called with the caught error — hook up logging here if needed. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render-phase errors anywhere below it and shows a recoverable
 * "Reload" screen instead of the default React behavior of unmounting the
 * whole tree to a blank page. Intended as a top-level safety net — e.g. for
 * a stale auth/query state after a long-backgrounded tab causes some
 * component to dereference now-missing data.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    if (this.props.fallback !== undefined) return this.props.fallback

    return (
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#111827' }}>
          Something went wrong.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem', color: '#6b7280' }}>
          Try reloading the page. If this keeps happening, please contact support.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.625rem 1.25rem',
            borderRadius: '0.5rem',
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 600,
            fontSize: '0.9375rem',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
