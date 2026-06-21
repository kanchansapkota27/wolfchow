import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Payments } from './Payments'
import { ApiError } from '@wolfchow/api-client'
import type { StripeStatus, PaymentMethods, TipsConfig, TaxConfig, AutomationConfig } from '@wolfchow/api-client'

const mockGetStripeStatus = vi.fn()
const mockSaveStripeKeys = vi.fn()
const mockDeleteStripeKeys = vi.fn()
const mockGetPaymentMethods = vi.fn()
const mockPatchPaymentMethods = vi.fn()
const mockPatchPickupNote = vi.fn()
const mockGetTips = vi.fn()
const mockPatchTips = vi.fn()
const mockGetTax = vi.fn()
const mockPatchTax = vi.fn()
const mockGetAutomation = vi.fn()
const mockPatchAutomation = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      getStripeStatus: mockGetStripeStatus,
      saveStripeKeys: mockSaveStripeKeys,
      deleteStripeKeys: mockDeleteStripeKeys,
      getPaymentMethods: mockGetPaymentMethods,
      patchPaymentMethods: mockPatchPaymentMethods,
      patchPickupNote: mockPatchPickupNote,
      getTips: mockGetTips,
      patchTips: mockPatchTips,
      getTax: mockGetTax,
      patchTax: mockPatchTax,
      getAutomation: mockGetAutomation,
      patchAutomation: mockPatchAutomation,
    },
  }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading, disabled, type }: {
    children: React.ReactNode
    onClick?: () => void
    loading?: boolean
    disabled?: boolean
    type?: string
  }) => (
    <button onClick={onClick} disabled={disabled ?? loading} type={type as 'button' | 'submit' | 'reset' | undefined}>{children}</button>
  ),
}))

const NO_STRIPE: StripeStatus = { publishable_key: null, has_secret: false, updated_at: null }
const WITH_STRIPE: StripeStatus = { publishable_key: 'pk_test_abc', has_secret: true, updated_at: '2026-01-01T00:00:00Z' }
const METHODS: PaymentMethods = { payment_methods: ['card'], pickup_delivery_note: null }
const TIPS: TipsConfig = { tips_enabled: true, tip_presets: [10, 15], allow_custom_tip: true, show_no_tip: false }
const TAX: TaxConfig = { tax_enabled: false, tax_rate: 0, tax_inclusive: false }
const AUTOMATION: AutomationConfig = { auto_accept: false, auto_reject_enabled: false, auto_reject_minutes: 15 }

beforeEach(() => {
  vi.resetAllMocks()
  mockGetStripeStatus.mockResolvedValue(NO_STRIPE)
  mockGetPaymentMethods.mockResolvedValue(METHODS)
  mockGetTips.mockResolvedValue(TIPS)
  mockGetTax.mockResolvedValue(TAX)
  mockGetAutomation.mockResolvedValue(AUTOMATION)
})

describe('STORY-061 · Payment configuration UI', () => {
  it('no Stripe keys: warning banner, payment methods disabled', async () => {
    render(<Payments />)
    await screen.findByText('Not configured ⚠')
    expect(screen.getByRole('note', { name: 'Stripe not configured' })).toBeTruthy()
    const cardToggle = screen.getByLabelText('Card payment method')
    expect(cardToggle).toBeDisabled()
  })

  it('invalid key format: inline error before API call', async () => {
    render(<Payments />)
    await screen.findByText('Not configured ⚠')
    const skInput = screen.getByLabelText('Stripe secret key')
    fireEvent.change(skInput, { target: { value: 'bad_key' } })
    const pkInput = screen.getByLabelText('Stripe publishable key')
    fireEvent.change(pkInput, { target: { value: 'pk_test_abc' } })
    fireEvent.click(screen.getByText('Save & Verify'))
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByRole('alert').textContent).toContain('sk_live_ or sk_test_')
    expect(mockSaveStripeKeys).not.toHaveBeenCalled()
  })

  it('Stripe verify fails: error shown inline', async () => {
    mockSaveStripeKeys.mockRejectedValue(new ApiError(422, { error: 'invalid_stripe_key' }))
    render(<Payments />)
    await screen.findByText('Save & Verify')
    const skInput = screen.getByLabelText('Stripe secret key')
    fireEvent.change(skInput, { target: { value: 'sk_test_abc' } })
    const pkInput = screen.getByLabelText('Stripe publishable key')
    fireEvent.change(pkInput, { target: { value: 'pk_test_abc' } })
    fireEvent.click(screen.getByText('Save & Verify'))
    await waitFor(() => expect(mockSaveStripeKeys).toHaveBeenCalled())
    await waitFor(() => screen.getByRole('alert'), { timeout: 2000 })
    expect(screen.getByRole('alert').textContent).toContain('Stripe rejected')
  })

  it('locked payment method: toggle disabled', async () => {
    mockGetStripeStatus.mockResolvedValue(WITH_STRIPE)
    mockPatchPaymentMethods.mockRejectedValue(new ApiError(402, { error: 'plan_limit_reached', allowed: ['card'], disallowed: ['delivery'] }))
    render(<Payments />)
    await screen.findByText('Connected ✓')
    // Try enabling delivery → 402 → planAllowed set to ['card']
    const deliveryToggle = screen.getByLabelText('Pay on Delivery payment method')
    fireEvent.click(deliveryToggle)
    await waitFor(() => expect(mockPatchPaymentMethods).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Pay on Delivery payment method')).toBeDisabled(), { timeout: 2000 })
  })

  it('tip preview: updates live as presets change', async () => {
    render(<Payments />)
    // Wait for Tips section to load
    await screen.findByText('Tip presets (select up to 6)')
    // 10% and 15% are pre-selected (in TIPS fixture); preview spans appear
    const tens = screen.getAllByText('10%')
    expect(tens.length).toBeGreaterThan(0)
    // Custom tip option shown in preview
    expect(screen.getByText('Custom')).toBeTruthy()
  })

  it('auto-reject timeout: hidden when auto-reject off', async () => {
    render(<Payments />)
    await screen.findByText('Auto-reject unaccepted orders after timeout')
    // auto_reject_enabled is false by default → timeout dropdown should not be visible
    expect(screen.queryByLabelText('Auto-reject timeout')).toBeNull()
    // Enable auto-reject
    fireEvent.click(screen.getByLabelText('Auto-reject orders'))
    // Now the timeout dropdown should appear
    await waitFor(() => expect(screen.getByLabelText('Auto-reject timeout')).toBeTruthy())
  })

  it('tax enabled: rate input + inclusive/exclusive radio shown', async () => {
    render(<Payments />)
    await screen.findByText('Enable tax')
    // Tax is disabled by default
    expect(screen.queryByLabelText('Tax rate')).toBeNull()
    // Enable tax
    fireEvent.click(screen.getByLabelText('Enable tax'))
    // Rate input and radio buttons should appear
    await waitFor(() => expect(screen.getByLabelText('Tax rate')).toBeTruthy())
    expect(screen.getByText('Prices include tax')).toBeTruthy()
    expect(screen.getByText('Add tax on top')).toBeTruthy()
  })

  it('tax preview: updates correctly for inclusive vs exclusive', async () => {
    mockGetTax.mockResolvedValue({ tax_enabled: true, tax_rate: 10, tax_inclusive: false })
    render(<Payments />)
    await screen.findByLabelText('Tax preview')
    // Exclusive: $100 + $10 tax = $110
    const preview = screen.getByLabelText('Tax preview')
    expect(preview.textContent).toContain('$10.00 tax')
    // Switch to inclusive
    fireEvent.click(screen.getByText('Prices include tax'))
    await waitFor(() => expect(screen.getByLabelText('Tax preview').textContent).toContain('$9.09'))
  })

  it('tax_rate negative: inline validation error', async () => {
    mockGetTax.mockResolvedValue({ tax_enabled: true, tax_rate: 10, tax_inclusive: false })
    render(<Payments />)
    await screen.findByLabelText('Tax rate')
    fireEvent.change(screen.getByLabelText('Tax rate'), { target: { value: '-5' } })
    // Click Save in Tax section — find the Save button nearest the Tax section
    const saveBtns = screen.getAllByText('Save')
    // Tax section is the 4th section; click its Save button
    fireEvent.click(saveBtns[1]) // Tips save is index 0, Tax save is index 1
    await waitFor(() => screen.getByRole('alert'))
    expect(screen.getByRole('alert').textContent).toContain('positive')
    expect(mockPatchTax).not.toHaveBeenCalled()
  })

  it('auto-reject: patchAutomation called with correct values', async () => {
    mockPatchAutomation.mockResolvedValue({ auto_accept: false, auto_reject_enabled: true, auto_reject_minutes: 10 })
    render(<Payments />)
    await screen.findByText('Auto-reject unaccepted orders after timeout')
    fireEvent.click(screen.getByLabelText('Auto-reject orders'))
    await waitFor(() => screen.getByLabelText('Auto-reject timeout'))
    fireEvent.change(screen.getByLabelText('Auto-reject timeout'), { target: { value: '10' } })
    // Find and click the automation Save button (last Save)
    const saveBtns = screen.getAllByText('Save')
    fireEvent.click(saveBtns[saveBtns.length - 1])
    await waitFor(() => expect(mockPatchAutomation).toHaveBeenCalledWith(
      expect.objectContaining({ auto_reject_enabled: true, auto_reject_minutes: 10 })
    ))
  })
})
