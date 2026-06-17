import type { InputHTMLAttributes } from 'react'
import { useId } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

/** Labelled text input with error and helper-text slots, wired for a11y. */
export function Input({ label, error, helperText, id, className, ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const describedBy = error
    ? `${inputId}-error`
    : helperText
      ? `${inputId}-help`
      : undefined

  return (
    <div className="wc-field">
      {label && (
        <label htmlFor={inputId} className="wc-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={['wc-input', error ? 'wc-input--error' : '', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="wc-error" role="alert">
          {error}
        </p>
      ) : helperText ? (
        <p id={`${inputId}-help`} className="wc-help">
          {helperText}
        </p>
      ) : null}
    </div>
  )
}
