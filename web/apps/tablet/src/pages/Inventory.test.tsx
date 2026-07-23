import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Inventory } from './Inventory'

const mockGetInventory = vi.fn()
const mockPatchInventoryItem = vi.fn()
let mockHasPermission = vi.fn(() => true)

vi.mock('../lib/api', () => ({
  useApi: () => ({
    orders: {
      getInventory: mockGetInventory,
      patchInventoryItem: mockPatchInventoryItem,
    },
  }),
}))

vi.mock('../lib/realtime', () => ({
  useRealtime: () => ({ subscribe: () => () => undefined }),
}))

vi.mock('@wolfchow/auth', () => ({
  useAuth: () => ({ hasPermission: mockHasPermission }),
}))

const ONE_ITEM = {
  categories: [{ id: 'cat-1', name: 'Mains', availability_state: 'available', position: 0 }],
  items: [{ id: 'item-1', name: 'Burger', category_id: 'cat-1', availability_state: 'available', restore_at: null }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHasPermission = vi.fn(() => true)
})

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

describe('STORY-097 · availability sheet: duration options and error handling', () => {
  it('shows the new duration presets and a custom date picker', async () => {
    mockGetInventory.mockResolvedValue(ONE_ITEM)
    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Burger'))

    expect(screen.getByText('1 hour')).toBeInTheDocument()
    expect(screen.getByText('Rest of the day')).toBeInTheDocument()
    expect(screen.getByText('End of this week')).toBeInTheDocument()
    expect(screen.getByLabelText('Out of stock until date')).toBeInTheDocument()
    expect(screen.getByText('Set')).toBeInTheDocument()
  })

  it('picking "In Stock" sends restore_at: null and the item updates', async () => {
    mockGetInventory.mockResolvedValue(ONE_ITEM)
    mockPatchInventoryItem.mockResolvedValue({ availability_state: 'available', restore_at: null })
    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Burger'))
    fireEvent.click(screen.getByText('✓ In Stock'))

    await waitFor(() => expect(mockPatchInventoryItem).toHaveBeenCalledWith('item-1', { availability_state: 'available', restore_at: null }))
  })

  it('failed update shows an inline error instead of failing silently', async () => {
    mockGetInventory.mockResolvedValue(ONE_ITEM)
    mockPatchInventoryItem.mockRejectedValue(new Error('422'))
    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Burger'))
    fireEvent.click(screen.getByText('✓ In Stock'))

    await waitFor(() => expect(screen.getByText('Could not update availability. Please try again.')).toBeInTheDocument())
    // Sheet stays open on failure so the user can retry.
    expect(screen.getByText('✓ In Stock')).toBeInTheDocument()
  })
})

describe('STORY-097 · availability sheet: permission gating', () => {
  it('without inventory:write: action buttons hidden, a message is shown instead', async () => {
    mockHasPermission = vi.fn(() => false)
    mockGetInventory.mockResolvedValue(ONE_ITEM)
    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Burger'))

    expect(screen.getByText(/don't have permission to change item availability/)).toBeInTheDocument()
    expect(screen.queryByText('✓ In Stock')).not.toBeInTheDocument()
    expect(screen.queryByText('✕ Out of Stock')).not.toBeInTheDocument()
    expect(screen.queryByText('1 hour')).not.toBeInTheDocument()
  })

  it('without inventory:write: inventory list is still viewable', async () => {
    mockHasPermission = vi.fn(() => false)
    mockGetInventory.mockResolvedValue(ONE_ITEM)
    render(<Inventory />)

    await waitFor(() => expect(screen.getByText('Burger')).toBeInTheDocument())
    expect(screen.getByText('Mains')).toBeInTheDocument()
    expect(screen.getAllByText('In Stock').length).toBeGreaterThan(0)
  })
})
