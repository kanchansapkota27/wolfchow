export interface SectionErrorProps {
  onRetry?: () => void
  message?: string
}

/** Inline error state for a dashboard section, with an optional retry button. */
export function SectionError({ onRetry, message = 'Failed to load' }: SectionErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-red-200"
    >
      <p className="font-medium">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-red-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      )}
    </div>
  )
}
