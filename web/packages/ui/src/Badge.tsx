import type { ReactNode } from 'react'

export type BadgeVariant =
  | 'gray'
  | 'blue'
  | 'green'
  | 'amber'
  | 'red'
  | 'indigo'
  | 'purple'

export interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

/** Small status pill. Variants align with the `b-*` brand color tokens. */
export function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return (
    <span className={['wc-badge', `wc-badge--${variant}`, className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
