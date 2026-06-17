import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

/** Friendly placeholder for empty lists/areas, with an optional CTA. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="wc-empty" role="status">
      {icon && (
        <div className="wc-empty__icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="wc-empty__title">{title}</h3>
      {description && <p className="wc-empty__desc">{description}</p>}
      {action && <div className="wc-empty__action">{action}</div>}
    </div>
  )
}
