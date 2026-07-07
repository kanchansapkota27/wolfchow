import { useState, useEffect } from 'react'
import type { PublicMenuItem, PublicVariant, CartModifier } from '../types'
import { formatCurrency } from '@wolfchow/utils'

interface ItemModalProps {
  item: PublicMenuItem
  currency: string
  showModifiers: boolean
  onAdd: (variantId: string | null, variantName: string | null, basePrice: number, modifiers: CartModifier[], quantity: number, notes: string) => void
  onClose: () => void
}

export function ItemModal({ item, currency, showModifiers, onAdd, onClose }: ItemModalProps) {
  const defaultVariant = item.variants.find((v) => v.is_default) ?? item.variants[0]
  const [selectedVariant, setSelectedVariant] = useState<PublicVariant | null>(defaultVariant ?? null)
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string>>({})
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const basePrice = selectedVariant ? selectedVariant.price : item.price
  const modifierTotal = Object.entries(selectedModifiers).reduce((sum, [, optId]) => {
    for (const group of item.modifier_groups) {
      const opt = group.options.find((o) => o.id === optId)
      if (opt) return sum + opt.price_delta
    }
    return sum
  }, 0)
  const unitPrice = basePrice + modifierTotal
  const totalPrice = unitPrice * quantity

  const requiredGroups = showModifiers ? item.modifier_groups.filter((g) => g.required) : []
  const isValid = requiredGroups.every((g) => selectedModifiers[g.id] !== undefined)

  const handleModifierSelect = (groupId: string, optionId: string) => {
    setSelectedModifiers((prev) => ({ ...prev, [groupId]: optionId }))
  }

  const handleSubmit = () => {
    if (!isValid) return
    const modifiers: CartModifier[] = Object.entries(selectedModifiers)
      .map(([groupId, optionId]) => {
        const group = item.modifier_groups.find((g) => g.id === groupId)
        const option = group?.options.find((o) => o.id === optionId)
        if (!group || !option) return null
        return { group_id: groupId, option_id: optionId, name: option.name, price_delta: option.price_delta }
      })
      .filter(Boolean) as CartModifier[]

    onAdd(
      selectedVariant?.id ?? null,
      selectedVariant?.name ?? null,
      basePrice,
      modifiers,
      quantity,
      notes,
    )
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: '100%',
          background: '#fff',
          borderRadius: '1rem 1rem 0 0',
          maxHeight: '90%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1rem 0.5rem', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
              {item.name}
            </h3>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '1.25rem', padding: '0', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          {item.description && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {item.description}
            </p>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem' }}>
          {/* Variants */}
          {item.has_variants && item.variants.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <p style={{ margin: '0 0 0.5rem', fontWeight: 600, fontSize: '0.9375rem' }}>Size / Option</p>
              {item.variants.map((v) => (
                <label
                  key={v.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.625rem 0.75rem',
                    marginBottom: '0.375rem',
                    borderRadius: '0.5rem',
                    border: `1.5px solid ${selectedVariant?.id === v.id ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                    background: selectedVariant?.id === v.id ? 'rgba(37,99,235,0.06)' : '#fff',
                    cursor: v.available ? 'pointer' : 'default',
                    opacity: v.available ? 1 : 0.5,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="radio"
                      name="variant"
                      value={v.id}
                      checked={selectedVariant?.id === v.id}
                      disabled={!v.available}
                      onChange={() => setSelectedVariant(v)}
                      style={{ accentColor: 'var(--brand-primary, #2563eb)' }}
                    />
                    <span style={{ fontSize: '0.9375rem', color: '#111827' }}>{v.name}</span>
                    {!v.available && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>(Sold out)</span>}
                  </div>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                    {formatCurrency(v.price, currency)}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Modifier groups */}
          {showModifiers && item.modifier_groups.map((group) => (
            <div key={group.id} style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem' }}>{group.name}</p>
                {group.required && (
                  <span style={{ fontSize: '0.6875rem', color: '#ef4444', fontWeight: 600 }}>Required</span>
                )}
                {group.type === 'multi' && (
                  <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>Choose multiple</span>
                )}
              </div>
              {group.options.filter((o) => o.available).map((opt) => (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.25rem',
                    borderRadius: '0.5rem',
                    border: `1.5px solid ${selectedModifiers[group.id] === opt.id ? 'var(--brand-primary, #2563eb)' : '#e5e7eb'}`,
                    background: selectedModifiers[group.id] === opt.id ? 'rgba(37,99,235,0.06)' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type={group.type === 'single' ? 'radio' : 'checkbox'}
                      name={`modifier-${group.id}`}
                      value={opt.id}
                      checked={selectedModifiers[group.id] === opt.id}
                      onChange={() => handleModifierSelect(group.id, opt.id)}
                      style={{ accentColor: 'var(--brand-primary, #2563eb)' }}
                    />
                    <span style={{ fontSize: '0.9375rem' }}>{opt.name}</span>
                  </div>
                  {opt.price_delta !== 0 && (
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {opt.price_delta > 0 ? '+' : ''}{formatCurrency(opt.price_delta, currency)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          ))}

          {/* Notes */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9375rem', marginBottom: '0.375rem' }}>
              Special instructions
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., no onions, extra sauce..."
              maxLength={500}
              rows={2}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '0.5rem',
                border: '1.5px solid #e5e7eb',
                fontSize: '0.875rem',
                resize: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
          {/* Quantity */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{
                width: '2.25rem', height: '2.25rem',
                borderRadius: '9999px',
                border: '1.5px solid #e5e7eb',
                background: '#fff',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              −
            </button>
            <span style={{ fontWeight: 700, fontSize: '1.125rem', minWidth: '2rem', textAlign: 'center' }}>{quantity}</span>
            <button
              onClick={() => setQuantity(Math.min(50, quantity + 1))}
              style={{
                width: '2.25rem', height: '2.25rem',
                borderRadius: '9999px',
                border: '1.5px solid #e5e7eb',
                background: '#fff',
                fontSize: '1.25rem',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!isValid}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: isValid ? 'var(--brand-primary, #2563eb)' : '#d1d5db',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: isValid ? 'pointer' : 'not-allowed',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Add to Cart</span>
            <span>{formatCurrency(totalPrice, currency)}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
