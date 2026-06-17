export type SpinnerSize = 'sm' | 'md' | 'lg'

const SIZE_PX: Record<SpinnerSize, number> = { sm: 14, md: 20, lg: 28 }

export interface SpinnerProps {
  size?: SpinnerSize
  /** Accessible label announced to screen readers. */
  label?: string
  className?: string
}

/** Indeterminate loading spinner. Carries `role="status"` for assistive tech. */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  const px = SIZE_PX[size]
  return (
    <span role="status" className={['wc-spinner', className].filter(Boolean).join(' ')}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="wc-spinner__svg"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <span className="wc-visually-hidden">{label}</span>
    </span>
  )
}
