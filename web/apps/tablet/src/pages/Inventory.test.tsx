import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Inventory } from './Inventory'

const mockGetInventory = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    orders: {
      getInventory: mockGetInventory,
      patchInventoryItem: vi.fn(),
    },
  }),
}))

vi.mock('../lib/realtime', () => ({
  useRealtime: () => ({ subscribe: () => () => undefined }),
}))

describe('STORY-090 · tablet inventory hides empty categories', () => {
  it('category with zero items is not rendered', async () => {
    mockGetInventory.mockResolvedValue({
      categories: [
        { id: 'cat-1', name: 'Mains', availability_state: 'available', position: 0 },
        { id: 'cat-2', name: 'Empty Category', availability_state: 'available', position: 1 },
      ],
      items: [
        { id: 'item-1', name: 'Burger', category_id: 'cat-1', availability_state: 'available', restore_at: null },
      ],
    })

    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    expect(screen.getByText('Mains')).toBeInTheDocument()
    expect(screen.queryByText('Empty Category')).not.toBeInTheDocument()
  })

  it('summary count reflects only non-empty categories', async () => {
    mockGetInventory.mockResolvedValue({
      categories: [
        { id: 'cat-1', name: 'Mains', availability_state: 'available', position: 0 },
        { id: 'cat-2', name: 'Empty Category', availability_state: 'available', position: 1 },
      ],
      items: [
        { id: 'item-1', name: 'Burger', category_id: 'cat-1', availability_state: 'available', restore_at: null },
      ],
    })

    render(<Inventory />)

    await waitFor(() => expect(screen.getByText(/1 item across 1 category/)).toBeInTheDocument())
  })

  it('all categories empty: shows the "No inventory items" empty state', async () => {
    mockGetInventory.mockResolvedValue({
      categories: [{ id: 'cat-1', name: 'Mains', availability_state: 'available', position: 0 }],
      items: [],
    })

    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('No inventory items')).toBeInTheDocument())
    expect(screen.queryByText('Mains')).not.toBeInTheDocument()
  })
})
