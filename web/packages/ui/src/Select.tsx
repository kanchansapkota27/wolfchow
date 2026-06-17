import { useId, useMemo, useState } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  className?: string
}

/**
 * Searchable single-select using the combobox pattern: a text input filters the
 * option list, and selecting an option commits its value. Roles
 * (`combobox`/`listbox`/`option`) are set for assistive tech.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select…',
  className,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listId = useId()
  const inputId = useId()

  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  )

  return (
    <div className={['wc-select', className].filter(Boolean).join(' ')}>
      {label && (
        <label htmlFor={inputId} className="wc-label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className="wc-input"
        placeholder={placeholder}
        value={open ? query : (selected?.label ?? '')}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && (
        <ul id={listId} role="listbox" className="wc-select__list">
          {filtered.length === 0 ? (
            <li className="wc-select__empty" aria-disabled="true">
              No matches
            </li>
          ) : (
            filtered.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className="wc-select__option"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(option.value)
                  setQuery('')
                  setOpen(false)
                }}
              >
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
