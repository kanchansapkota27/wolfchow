import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Menu } from './Menu'
import type { MenuCategory, MenuItem, ModifierGroup } from '@wolfchow/types'

const mockListCategories = vi.fn()
const mockCreateCategory = vi.fn()
const mockUpdateCategory = vi.fn()
const mockDeleteCategory = vi.fn()
const mockReorderCategories = vi.fn()
const mockListItems = vi.fn()
const mockCreateItem = vi.fn()
const mockUpdateItem = vi.fn()
const mockDeleteItem = vi.fn()
const mockGetItemImageUrl = vi.fn()
const mockListGlobalModifierGroups = vi.fn()
const mockCreateGlobalModifierGroup = vi.fn()
const mockUpdateModifierGroup = vi.fn()
const mockDeleteModifierGroup = vi.fn()
const mockDeleteModifierOption = vi.fn()
const mockCreateModifierOption = vi.fn()
const mockGetItemModifierAssignments = vi.fn()
const mockSetItemModifierAssignments = vi.fn()
const mockReorderItems = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listCategories: mockListCategories,
      createCategory: mockCreateCategory,
      updateCategory: mockUpdateCategory,
      deleteCategory: mockDeleteCategory,
      reorderCategories: mockReorderCategories,
      listItems: mockListItems,
      createItem: mockCreateItem,
      updateItem: mockUpdateItem,
      deleteItem: mockDeleteItem,
      getItemImageUrl: mockGetItemImageUrl,
      listGlobalModifierGroups: mockListGlobalModifierGroups,
      createGlobalModifierGroup: mockCreateGlobalModifierGroup,
      updateModifierGroup: mockUpdateModifierGroup,
      deleteModifierGroup: mockDeleteModifierGroup,
      deleteModifierOption: mockDeleteModifierOption,
      createModifierOption: mockCreateModifierOption,
      getItemModifierAssignments: mockGetItemModifierAssignments,
      setItemModifierAssignments: mockSetItemModifierAssignments,
      reorderItems: mockReorderItems,
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

const CAT1: MenuCategory = { id: 'cat1', restaurant_id: 'r1', name: 'Starters', sort_order: 0, active: true, availability_state: 'available', created_at: '2026-01-01T00:00:00Z' }
const CAT2: MenuCategory = { id: 'cat2', restaurant_id: 'r1', name: 'Mains', sort_order: 1, active: true, availability_state: 'available', created_at: '2026-01-01T00:00:00Z' }
const ITEM1: MenuItem = {
  id: 'item1', restaurant_id: 'r1', category_id: 'cat1',
  name: 'Bruschetta', description: null, price: 850,
  availability_state: 'available', restore_at: null, image_r2_key: null,
  tags: ['vegan'], has_variants: false, sort_order: 0, variants: [],
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListCategories.mockResolvedValue([CAT1, CAT2])
  mockListItems.mockResolvedValue([ITEM1])
  mockReorderCategories.mockResolvedValue({ ok: true })
  mockUpdateItem.mockResolvedValue({ ...ITEM1 })
  mockListGlobalModifierGroups.mockResolvedValue([])
  mockCreateGlobalModifierGroup.mockResolvedValue({ id: 'grp1', name: 'Size', item_id: null, type: 'single', required: false, availability_state: 'available', sort_order: 0, options: [] })
  mockCreateModifierOption.mockResolvedValue({ id: 'opt1', group_id: 'grp1', restaurant_id: 'r1', name: 'Small', price_delta: 0, available: true })
  mockDeleteModifierGroup.mockResolvedValue(undefined)
  mockDeleteModifierOption.mockResolvedValue(undefined)
  mockGetItemModifierAssignments.mockResolvedValue([])
  mockSetItemModifierAssignments.mockResolvedValue({ group_ids: [] })
  mockReorderItems.mockResolvedValue(undefined)
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

  it('reorder categories: move-up calls reorderCategories with swapped sort_order', async () => {
    render(<Menu />)
    await screen.findAllByText('Mains')
    // CAT2 is at index 1 — its move-up button swaps it above CAT1
    const moveUpBtn = screen.getByLabelText('Move Mains up')
    fireEvent.click(moveUpBtn)
    await waitFor(() =>
      expect(mockReorderCategories).toHaveBeenCalledWith([
        { id: 'cat2', sort_order: 0 },
        { id: 'cat1', sort_order: 1 },
      ]),
    )
  })

  it('reorder categories: first item move-up button is disabled', async () => {
    render(<Menu />)
    await screen.findAllByText('Starters')
    const moveUpBtn = screen.getByLabelText('Move Starters up')
    expect((moveUpBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('out-of-stock timer: restore_at input shown when availability is out_of_stock', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('+ Add item'))
    fireEvent.click(screen.getByText('+ Add item'))
    // Select "Out of Stock" radio
    const outOfStockRadio = screen.getByDisplayValue('out_of_stock')
    fireEvent.click(outOfStockRadio)
    await waitFor(() => screen.getByTestId('restore-at-input'))
    expect(screen.getByTestId('restore-at-input')).toBeTruthy()
  })

  it('out-of-stock timer: restore_at NOT shown for in_stock', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('+ Add item'))
    fireEvent.click(screen.getByText('+ Add item'))
    // Default is in_stock — restore-at should not be visible
    expect(screen.queryByTestId('restore-at-input')).toBeNull()
  })

  it('dietary tags: toggle selects and deselects tag', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('+ Add item'))
    fireEvent.click(screen.getByText('+ Add item'))
    // The modal has Vegan as a button; ITEM1 also shows a Vegan badge on the card.
    // Find the button specifically (tagName='BUTTON') within the dialog.
    const dialog = screen.getByRole('dialog', { name: 'Add item' })
    const veganBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Vegan',
    )!
    expect(veganBtn).toBeTruthy()
    fireEvent.click(veganBtn)
    expect(veganBtn.className).toContain('border-indigo-600')
    fireEvent.click(veganBtn)
    expect(veganBtn.className).not.toContain('border-indigo-600')
  })

  it('availability quick-toggle: clicking badge calls updateItem with new state', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('Bruschetta'))
    // The availability badge for ITEM1 (in_stock) — click it
    const badge = screen.getByLabelText('Availability: in_stock')
    fireEvent.click(badge)
    // The dropdown should show options
    await waitFor(() => screen.getByText('Out of Stock'))
    fireEvent.click(screen.getByText('Out of Stock'))
    await waitFor(() =>
      expect(mockUpdateItem).toHaveBeenCalledWith('item1', { availability_state: 'out_of_stock' }),
    )
  })

  it('ModifiersTab: creating a global group calls createGlobalModifierGroup', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('Bruschetta'))
    // Switch to Modifiers top tab
    fireEvent.click(screen.getByText('Modifiers'))
    await waitFor(() => screen.getByText('ADD GROUP'))
    fireEvent.click(screen.getByText('ADD GROUP'))
    const groupNameInput = screen.getByPlaceholderText('e.g. Size, Spice Level, Extras')
    fireEvent.change(groupNameInput, { target: { value: 'Spice Level' } })
    fireEvent.click(screen.getByText('Create Group'))
    await waitFor(() =>
      expect(mockCreateGlobalModifierGroup).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Spice Level', type: 'single', required: false }),
      ),
    )
  })

  it('variants: cannot delete the last variant', async () => {
    render(<Menu />)
    await waitFor(() => screen.getByText('+ Add item'))
    fireEvent.click(screen.getByText('+ Add item'))
    // Enable variants
    const variantsCheckbox = screen.getByRole('checkbox', {
      name: 'This item has multiple sizes / variants',
    })
    fireEvent.click(variantsCheckbox)
    // Add one variant — now there is exactly 1
    fireEvent.click(screen.getByText('+ Add variant'))
    // With exactly 1 variant, the aria-label indicates it cannot be deleted and the button is disabled
    const deleteVariantBtn = screen.getByLabelText('Cannot delete last variant')
    expect((deleteVariantBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('ModifiersTab: adding an option calls createModifierOption', async () => {
    const GROUP: ModifierGroup = {
      id: 'grp1', restaurant_id: 'r1', item_id: null,
      name: 'Size', type: 'single', required: false,
      availability_state: 'available', sort_order: 0,
      options: [],
    }
    mockListGlobalModifierGroups.mockResolvedValue([GROUP])
    render(<Menu />)
    await waitFor(() => screen.getByText('Bruschetta'))
    // Switch to Modifiers top tab
    fireEvent.click(screen.getByText('Modifiers'))
    await waitFor(() => screen.getByText('Size'))
    fireEvent.click(screen.getByText('+ Add option'))
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Small' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() =>
      expect(mockCreateModifierOption).toHaveBeenCalledWith(
        'grp1',
        expect.objectContaining({ name: 'Small' }),
      ),
    )
  })
})
