import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning'

interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
}

interface ToastContextValue {
  notify: (variant: ToastVariant, message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

/** Auto-dismiss delay, per spec. */
export const TOAST_DISMISS_MS = 3000

/**
 * Provides a `notify(variant, message)` function via context and renders the
 * toast stack. Each toast auto-dismisses after {@link TOAST_DISMISS_MS} and can
 * be dismissed manually.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback(
    (variant: ToastVariant, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, variant, message }])
      setTimeout(() => remove(id), TOAST_DISMISS_MS)
    },
    [remove],
  )

  const value = useMemo<ToastContextValue>(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="wc-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className={`wc-toast wc-toast--${toast.variant}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              className="wc-toast__close"
              aria-label="Dismiss notification"
              onClick={() => remove(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** Access the toast notifier. Must be called within a {@link ToastProvider}. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>')
  return ctx
}
