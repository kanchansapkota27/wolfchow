import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicMenuItem } from '../types'
import { ItemModal } from './ItemModal'

function itemWith(overrides: Partial<PublicMenuItem>): PublicMenuItem {
  return {
    id: 'item-1',
    name: 'Burger',
    description: null,
    price: 9.99,
    availability_state: 'available',
    image_url: null,
    tags: [],
    has_variants: false,
    sort_order: 0,
    variants: [],
    modifier_groups: [],
    special_requests_enabled: true,
    ...overrides,
  }
}

describe('ItemModal special instructions', () => {
  it('shows the special instructions field when enabled for the item', () => {
    render(
      <ItemModal item={itemWith({ special_requests_enabled: true })} currency="USD" showModifiers={false} onAdd={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Special instructions')).toBeInTheDocument()
  })

  it('hides the special instructions field when disabled for the item', () => {
    render(
      <ItemModal item={itemWith({ special_requests_enabled: false })} currency="USD" showModifiers={false} onAdd={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.queryByText('Special instructions')).not.toBeInTheDocument()
  })
})
