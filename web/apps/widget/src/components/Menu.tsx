import { useState } from 'react'
import type { PublicMenuCategory, PublicMenuItem, CartItem, WidgetSettings } from '../types'

const TAG_LABELS: Record<string, string> = {
  vegan: '🌱 Vegan',
  vegetarian: '🥦 Veg',
  spicy: '🌶️ Spicy',
  gluten_free: 'GF',
  contains_nuts: '🥜 Nuts',
  halal: 'Halal',
  dairy_free: 'DF',
  contains_alcohol: '🍷',
}

const AVAILABILITY_LABEL: Record<string, string> = {
  out_of_stock: 'Sold out',
  unavailable: 'Unavailable',
}

interface MenuProps {
  categories: PublicMenuCategory[]
  settings: WidgetSettings
  cartCount: number
  cartTotal: number
  onSelectItem: (item: PublicMenuItem) => void
  onViewCart: () => void
  onAddSimpleItem: (item: PublicMenuItem) => void
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents)
}

function ItemCard({
  item,
  currency,
  showPhotos,
  onSelect,
  onAddSimple,
}: {
  item: PublicMenuItem
  currency: string
  showPhotos: boolean
  onSelect: () => void
  onAddSimple: () => void
}) {
  const isUnavailable = item.availability_state === 'unavailable' || item.availability_state === 'out_of_stock'
  const unavailableLabel = AVAILABILITY_LABEL[item.availability_state]
  const needsCustomize = item.has_variants || item.modifier_groups.length > 0

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        padding: '0.875rem 0',
        borderBottom: '1px solid #f3f4f6',
        opacity: isUnavailable ? 0.6 : 1,
        cursor: isUnavailable ? 'default' : 'pointer',
      }}
      onClick={isUnavailable ? undefined : onSelect}
    >
      {showPhotos && item.image_url && (
        <img
          src={item.image_url}
          alt={item.name}
          style={{
            width: '5rem',
            height: '5rem',
            objectFit: 'cover',
            borderRadius: '0.5rem',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', color: '#111827', lineHeight: 1.3 }}>
              {item.name}
            </p>
            {item.description && (
              <p style={{
                margin: '0.25rem 0 0',
                fontSize: '0.8125rem',
                color: '#6b7280',
                lineHeight: '1.4',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {item.description}
              </p>
            )}
            {item.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: '0.6875rem',
                      padding: '0.1rem 0.375rem',
                      borderRadius: '9999px',
                      background: '#f3f4f6',
                      color: '#374151',
                    }}
                  >
                    {TAG_LABELS[tag] ?? tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem', flexShrink: 0 }}>
            <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>
              {item.has_variants
                ? `From ${formatPrice(Math.min(...item.variants.map((v) => v.price)), currency)}`
                : formatPrice(item.price, currency)}
            </span>
            {isUnavailable ? (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', padding: '0.25rem 0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.375rem' }}>
                {unavailableLabel}
              </span>
            ) : needsCustomize ? (
              <button
                onClick={(e) => { e.stopPropagation(); onSelect() }}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1.5px solid var(--brand-primary, #2563eb)',
                  background: 'transparent',
                  color: 'var(--brand-primary, #2563eb)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Customize
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onAddSimple() }}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: 'var(--brand-primary, #2563eb)',
                  color: '#fff',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Menu({ categories, settings, cartCount, cartTotal, onSelectItem, onViewCart, onAddSimpleItem }: MenuProps) {
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? '')
  const currency = settings.currency

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Category tabs */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        borderBottom: '1px solid #e5e7eb',
        scrollbarWidth: 'none',
        gap: '0',
        flexShrink: 0,
      }}>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCat(cat.id)}
            style={{
              padding: '0.75rem 1rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.875rem',
              fontWeight: activeCat === cat.id ? 700 : 400,
              color: activeCat === cat.id ? 'var(--brand-primary, #2563eb)' : '#6b7280',
              borderBottom: activeCat === cat.id ? '2px solid var(--brand-primary, #2563eb)' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Item list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 1rem' }}>
        {categories
          .filter((cat) => cat.id === activeCat)
          .map((cat) => (
            <div key={cat.id}>
              {cat.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  showPhotos={settings.features.menu_photos}
                  onSelect={() => onSelectItem(item)}
                  onAddSimple={() => onAddSimpleItem(item)}
                />
              ))}
              {cat.items.length === 0 && (
                <p style={{ textAlign: 'center', color: '#9ca3af', padding: '2rem 0' }}>
                  No items available
                </p>
              )}
            </div>
          ))}
      </div>

      {/* Cart button */}
      {cartCount > 0 && (
        <div style={{ padding: '1rem', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
          <button
            onClick={onViewCart}
            style={{
              width: '100%',
              padding: '0.875rem',
              borderRadius: '0.75rem',
              border: 'none',
              background: 'var(--brand-primary, #2563eb)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '0.375rem', padding: '0.125rem 0.5rem', fontSize: '0.875rem' }}>
              {cartCount}
            </span>
            <span>View Cart</span>
            <span>{formatPrice(cartTotal, currency)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
