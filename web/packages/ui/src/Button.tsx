import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** Shows a spinner and disables interaction. */
  loading?: boolean
  children?: ReactNode
}

/**
 * Primary action button. When `loading`, it renders a spinner and is both
 * `disabled` and `aria-disabled`/`aria-busy` so the control is inert and
 * announced correctly. Defaults to `type="button"` to avoid accidental form
 * submits.
 */
export function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading
  return (
    <button
      type={type}
      className={['wc-btn', `wc-btn--${variant}`, className].filter(Boolean).join(' ')}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      {...rest}
    >
      {loading && <Spinner size="sm" />}
      <span>{children}</span>
    </button>
  )
}
