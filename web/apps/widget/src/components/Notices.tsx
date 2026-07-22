import { useEffect, useState } from 'react'

interface Notice {
  id: string
  type: string
  message: string
  display_locations: string[]
  priority: number
}

interface NoticesProps {
  notices: Notice[]
  location: 'storefront' | 'checkout'
  /** Scopes the sessionStorage dismissal key so different restaurants don't collide. */
  slug: string
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  emergency: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  promotional: { bg: '#faf5ff', border: '#d8b4fe', text: '#6b21a8' },
  informational: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
}

function dismissedKey(slug: string): string {
  return `restroapi-widget:${slug}:dismissed-notices`
}

function readDismissed(slug: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(dismissedKey(slug))
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

export function Notices({ notices, location, slug }: NoticesProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(slug))

  useEffect(() => {
    setDismissed(readDismissed(slug))
  }, [slug])

  const visible = notices.filter((n) => n.display_locations.includes(location) && !dismissed.has(n.id))
  if (visible.length === 0) return null

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev).add(id)
      try {
        window.sessionStorage.setItem(dismissedKey(slug), JSON.stringify([...next]))
      } catch {
        // sessionStorage unavailable (private browsing, etc.) — dismissal just won't persist across reloads
      }
      return next
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
      {visible.map((n) => {
        const colors = TYPE_COLORS[n.type] ?? TYPE_COLORS['informational'] ?? { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' }
        return (
          <div
            key={n.id}
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              color: colors.text,
              fontSize: '0.875rem',
              lineHeight: '1.4',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
            }}
          >
            <span style={{ flex: 1 }}>{n.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(n.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'inherit',
                opacity: 0.6,
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
