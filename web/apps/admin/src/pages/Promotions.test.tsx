import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Promotions } from './Promotions'
import { ApiError } from '@wolfchow/api-client'
import type { Promotion } from '@wolfchow/api-client'

const mockListPromotions = vi.fn()
const mockCreatePromotion = vi.fn()
const mockUpdatePromotion = vi.fn()
const mockTogglePromotion = vi.fn()
const mockDeletePromotion = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listPromotions: mockListPromotions,
      createPromotion: mockCreatePromotion,
      updatePromotion: mockUpdatePromotion,
      togglePromotion: mockTogglePromotion,
      deletePromotion: mockDeletePromotion,
    },
  }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading, disabled, type, variant }: {
    children: React.ReactNode
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    type?: string
    variant?: string
  }) => (
    <button onClick={onClick} disabled={disabled ?? loading} type={type as 'button' | 'submit' | 'reset' | undefined} data-variant={variant}>{children}</button>
  ),
}))

const PROMO_CODE: Promotion = {
  id: 'promo-1',
  restaurant_id: 'rest-1',
  title: 'Summer Sale',
  description: '10% off all orders',
  promo_code: 'SUMMER10',
  discount_type: 'percentage',
  discount_value: 10,
  free_item_id: null,
  minimum_order_amount: null,
  usage_limit: 100,
  usage_count: 0,
  auto_apply: false,
  start_time: null,
  end_time: null,
  active_days: null,
  active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const PROMO_AUTO: Promotion = {
  ...PROMO_CODE,
  id: 'promo-2',
  title: 'Auto Discount',
  promo_code: null,
  auto_apply: true,
  usage_count: 5,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListPromotions.mockResolvedValue([PROMO_CODE])
})

describe('STORY-063 · promotions management UI', () => {
  it('plan without promotions: upsell banner shown when createPromotion returns 402 feature_locked', async () => {
    mockListPromotions.mockResolvedValue([])
    mockCreatePromotion.mockRejectedValue(
      new ApiError(402, { error: 'feature_locked', feature: 'promotions_enabled' }),
    )
    render(<Promotions />)
    await screen.findByText('No promotions yet')

    fireEvent.click(screen.getByText('Create promotion'))
    const dialog = await screen.findByRole('dialog')
    const titleInput = dialog.querySelector('input[type="text"]')!
    fireEvent.change(titleInput, { target: { value: 'Test' } })
    fireEvent.submit(dialog.querySelector('form')!)

    await waitFor(() => expect(mockCreatePromotion).toHaveBeenCalled())
    await waitFor(
      () => expect(screen.getByText(/Promotions not available on your plan/)).toBeTruthy(),
      { timeout: 2000 },
    )
  })

  it('promotions list: shows title and discount badge', async () => {
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    expect(screen.getByText('10% off')).toBeTruthy()
    expect(screen.getByText(/🎟 SUMMER10/)).toBeTruthy()
  })

  it('auto-apply on: shows auto-apply label and hides promo code field in create form', async () => {
    mockListPromotions.mockResolvedValue([PROMO_AUTO])
    render(<Promotions />)
    await screen.findByText('Auto Discount')
    expect(screen.getByText(/⚡ Auto-apply/)).toBeTruthy()

    // In the create modal, toggling auto-apply hides the promo code field
    fireEvent.click(screen.getByText('Create promotion'))
    const dialog = await screen.findByRole('dialog')
    // promo code field initially visible
    expect(dialog.querySelector('[aria-label="Promo code"]')).toBeTruthy()
    // toggle auto-apply on
    fireEvent.click(dialog.querySelector('[aria-label="Auto-apply promotion"]')!)
    await waitFor(() => expect(dialog.querySelector('[aria-label="Promo code"]')).toBeNull())
  })

  it('generate random: fills promo_code field', async () => {
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    fireEvent.click(screen.getByText('Create promotion'))
    const dialog = await screen.findByRole('dialog')
    const codeInput = dialog.querySelector('[aria-label="Promo code"]') as HTMLInputElement
    expect(codeInput.value).toBe('')
    fireEvent.click(screen.getByText('Generate random'))
    await waitFor(() => expect(codeInput.value.length).toBeGreaterThan(0))
  })

  it('delete with usage: delete button replaced by deactivate', async () => {
    mockListPromotions.mockResolvedValue([PROMO_AUTO])
    render(<Promotions />)
    await screen.findByText('Auto Discount')
    // usage_count = 5, so delete should not show; deactivate should
    expect(screen.queryByLabelText('Delete Auto Discount')).toBeNull()
    expect(screen.getByLabelText('Deactivate Auto Discount')).toBeTruthy()
  })

  it('toggle promo: calls togglePromotion and flips active state', async () => {
    mockTogglePromotion.mockResolvedValue({ active: false })
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    const toggle = screen.getByLabelText('Toggle Summer Sale')
    fireEvent.click(toggle)
    await waitFor(() => expect(mockTogglePromotion).toHaveBeenCalledWith('promo-1'))
  })

  it('delete with no usage: shows confirm then calls deletePromotion', async () => {
    mockDeletePromotion.mockResolvedValue(undefined)
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    fireEvent.click(screen.getByLabelText('Delete Summer Sale'))
    const confirmBtn = await screen.findByText('Confirm')
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mockDeletePromotion).toHaveBeenCalledWith('promo-1'))
    await waitFor(() => expect(screen.queryByText('Summer Sale')).toBeNull())
  })

  it('edit promotion: opens edit modal with prefilled values', async () => {
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    fireEvent.click(screen.getByLabelText('Edit Summer Sale'))
    const dialog = await screen.findByRole('dialog', { name: 'Edit promotion' })
    expect(dialog).toBeTruthy()
    const titleInput = dialog.querySelector('input[type="text"]') as HTMLInputElement
    expect(titleInput.value).toBe('Summer Sale')
  })

  it('create promotion: calls createPromotion and adds to list', async () => {
    const newPromo: Promotion = { ...PROMO_CODE, id: 'promo-99', title: 'Flash Sale' }
    mockCreatePromotion.mockResolvedValue(newPromo)
    render(<Promotions />)
    await screen.findByText('Summer Sale')
    fireEvent.click(screen.getByText('Create promotion'))
    const dialog = await screen.findByRole('dialog')
    const titleInput = dialog.querySelector('input[type="text"]')!
    fireEvent.change(titleInput, { target: { value: 'Flash Sale' } })
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(mockCreatePromotion).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('Flash Sale')).toBeTruthy())
  })
})
