import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'

export interface ModalProps {
  /** When false (or omitted while using conditional rendering) the modal is hidden. Defaults to true. */
  open?: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal dialog. While open it traps Tab focus within the dialog,
 * closes on Escape, closes on overlay click, and restores focus to the
 * previously-focused element on unmount.
 */
export function Modal({ open = true, onClose, title, children, footer, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = dialog
      ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      : []
    ;(focusables[0] ?? dialog)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) {
          event.preventDefault()
          return
        }
        const first = items[0]!
        const last = items[items.length - 1]!
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="wc-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={['wc-modal', className].filter(Boolean).join(' ')}
      >
        {title && (
          <h2 id={titleId} className="wc-modal__title">
            {title}
          </h2>
        )}
        {children}
        {footer && <div className="wc-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
