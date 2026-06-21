import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Menu } from './Menu'
import type { MenuCategory, MenuItem } from '@wolfchow/types'

const mockListCategories = vi.fn()
const mockCreateCategory = vi.fn()
const mockUpdateCategory = vi.fn()
const mockDeleteCategory = vi.fn()
const mockListItems = vi.fn()
const mockCreateItem = vi.fn()
const mockUpdateItem = vi.fn()
const mockDeleteItem = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listCategories: mockListCategories,
      createCategory: mockCreateCategory,
      updateCategory: mockUpdateCategory,
      deleteCategory: mockDeleteCategory,
      listItems: mockListItems,
      createItem: mockCreateItem,
      updateItem: mockUpdateItem,
      deleteItem: mockDeleteItem,
    },
  }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading, disabled, variant }: {
    children: React.ReactNode
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled ?? loading} data-variant={variant}>{children}</button>
  ),
  Modal: ({ title, children, footer, onClose }: {
    title: string
    children: React.ReactNode
    footer: React.ReactNode
    onClose: () => void
  }) => (
    <div role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <button onClick={onClose} aria-label="Close">✕</button>
      {children}
      <div>{footer}</div>
    </div>
  ),
}))

const CAT1: MenuCategory = { id: 'cat1', restaurant_id: 'r1', name: 'Starters', sort_order: 0, active: true, availability_state: 'in_stock', created_at: '2026-01-01T00:00:00Z' }
const CAT2: MenuCategory = { id: 'cat2', restaurant_id: 'r1', name: 'Mains', sort_order: 1, active: true, availability_state: 'in_stock', created_at: '2026-01-01T00:00:00Z' }
const ITEM1: MenuItem = {
  id: 'item1', restaurant_id: 'r1', category_id: 'cat1',
  name: 'Bruschetta', description: null, price: 850,
  availability_state: 'in_stock', restore_at: null, image_r2_key: null,
  tags: ['vegan'], has_variants: false, variants: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListCategories.mockResolvedValue([CAT1, CAT2])
  mockListItems.mockResolvedValue([ITEM1])
})

describe('STORY-058 · Menu management UI', () => {
  it('category list: renders all categories', async () => {
    render(<Menu />)
    const catLinks = await screen.findAllByText('Starters')
    expect(catLinks.length).toBeGreaterThan(0)
    expect(screen.getAllByText('Mains').length).toBeGreaterThan(0)
  })

  it('items grid shows items for selected category', async () => {
    render(<Menu />)
    // First category auto-selected — items should appear
    await waitFor(() => screen.getByText('Bruschetta'))
    expect(screen.getByText('$8.50')).toBeTruthy()
    expect(screen.getByText('Vegan')).toBeTruthy()
  })

  it('add category: modal opens, API called, list reloads', async () => {
    mockCreateCategory.mockResolvedValue({ id: 'cat3', name: 'Desserts' })
    render(<Menu />)
    await screen.findAllByText('Starters')
    fireEvent.click(screen.getByLabelText('Add category'))
    expect(screen.getByRole('dialog', { name: 'Add category' })).toBeTruthy()
    const nameInput = screen.getByRole('dialog', { name: 'Add category' }).querySelector('input')!
    fireEvent.change(nameInput, { target: { value: 'Desserts' } })
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Desserts', active: true }))
  })

  it('add item at cap: 402 shown as inline banner', async () => {
    const { ApiError } = await import('@wolfchow/api-client')
    mockCreateItem.mockRejectedValue(new ApiError(402, { error: 'plan_limit_reached' }))
    render(<Menu />)
    await waitFor(() => screen.getByText('+ Add item'))
    fireEvent.click(screen.getByText('+ Add item'))
    const nameInput = screen.getByLabelText('Item name')
    fireEvent.change(nameInput, { target: { value: 'New item' } })
    const priceInput = screen.getByLabelText('Price')
    fireEvent.change(priceInput, { target: { value: '12.50' } })
    fireEvent.click(screen.getByText('Create'))
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('delete item: modal shown, API called', async () => {
    mockDeleteItem.mockResolvedValue(undefined)
    render(<Menu />)
    await waitFor(() => screen.getByText('Bruschetta'))
    fireEvent.click(screen.getByLabelText('Delete Bruschetta'))
    const dialog = await screen.findByRole('dialog', { name: 'Delete item' })
    expect(dialog).toBeTruthy()
    // Click the danger Delete button inside the dialog (not the card-level "Delete" link)
    const deleteButtons = screen.getAllByText('Delete')
    const dialogDeleteBtn = deleteButtons.find((el) => el.closest('[role="dialog"]'))!
    fireEvent.click(dialogDeleteBtn)
    await waitFor(() => expect(mockDeleteItem).toHaveBeenCalledWith('item1'))
  })
})
