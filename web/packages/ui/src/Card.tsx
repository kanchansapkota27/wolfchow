import type { ReactNode } from 'react'

export interface CardProps {
  children: ReactNode
  title?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Surface container with optional header and footer slots. */
export function Card({ children, title, footer, className }: CardProps) {
  return (
    <section className={['wc-card', className].filter(Boolean).join(' ')}>
      {title && <header className="wc-card__header">{title}</header>}
      <div className="wc-card__body">{children}</div>
      {footer && <footer className="wc-card__footer">{footer}</footer>}
    </section>
  )
}
