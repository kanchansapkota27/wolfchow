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
}

const TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  emergency: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  promotional: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  informational: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
}

export function Notices({ notices, location }: NoticesProps) {
  const visible = notices.filter((n) => n.display_locations.includes(location))
  if (visible.length === 0) return null

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
            }}
          >
            {n.message}
          </div>
        )
      })}
    </div>
  )
}
