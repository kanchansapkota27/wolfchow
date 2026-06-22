import { useState } from 'react'

interface InlineEditProps {
  value: string
  onSave: (value: string) => void | Promise<void>
  ariaLabel: string
  type?: 'text' | 'number'
  placeholder?: string
}

/**
 * Click-to-edit text/number field. Enter commits via `onSave`, Escape (or blur)
 * cancels and reverts to the displayed value.
 */
export function InlineEdit({ value, onSave, ariaLabel, type = 'text', placeholder }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        className="rounded px-2 py-1 text-left text-gray-700 hover:bg-gray-100"
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
      >
        {value || <span className="text-gray-500">{placeholder ?? '—'}</span>}
      </button>
    )
  }

  return (
    <input
      autoFocus
      type={type}
      aria-label={ariaLabel}
      className="wc-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void onSave(draft)
          setEditing(false)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setEditing(false)
        }
      }}
      onBlur={() => setEditing(false)}
    />
  )
}
