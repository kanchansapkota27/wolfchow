import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Integrations } from './Integrations'
import type { Restaurant } from '@wolfchow/types'

const mockGetRestaurant = vi.fn()
const mockSaveIntegrations = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      getRestaurant: mockGetRestaurant,
      saveIntegrations: mockSaveIntegrations,
    },
  }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, type, variant }: {
    children: React.ReactNode
    onClick?: () => void
    type?: string
    variant?: string
  }) => (
    <button onClick={onClick} type={type as 'button' | 'submit' | 'reset' | undefined} data-variant={variant}>{children}</button>
  ),
}))

const RESTAURANT: Restaurant = {
  id: 'rest-1',
  slug: 'pizza-palace',
  display_name: 'Pizza Palace',
  business_name: 'Pizza Palace LLC',
  timezone: 'UTC',
  currency: 'USD',
  address: { city: 'NYC', country: 'US', line1: '1 Main St' },
  logo_r2_key: null,
  brand_colors: { primary: '#6366f1', secondary: '#4f46e5' },
  cuisine_type: null,
  services_offered: [],
  social_links: { facebook: 'https://facebook.com/pizza' },
  delivery_links: { doordash: 'https://doordash.com/pizza' },
  plan_id: null,
  override_commission_type: null,
  override_commission_value: null,
  billing_note: null,
  active: true,
  base_prep_minutes: 15,
  scheduling_interval: 15,
  future_days_allowed: 7,
  tax_enabled: false,
  tax_rate: 0,
  tax_inclusive: false,
  tips_enabled: true,
  tip_presets: [10, 15, 20],
  allow_custom_tip: true,
  show_no_tip: true,
  auto_accept: false,
  auto_reject_enabled: false,
  auto_reject_minutes: 15,
  menu_image_display: 'both',
  orders_paused: false,
  pause_until: null,
  pause_reason: null,
  pause_mode: null,
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetRestaurant.mockResolvedValue(RESTAURANT)
  mockSaveIntegrations.mockResolvedValue({ restaurant: RESTAURANT })
  // Mock clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
  })
})

describe('STORY-066 · integrations & widget preview UI', () => {
  it('copy embed code: clipboard contains script tag with slug', async () => {
    render(<Integrations />)
    await screen.findByText(/pizza-palace/)
    fireEvent.click(screen.getByLabelText('Copy embed code'))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled())
    const call = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(call).toContain('data-restaurant="pizza-palace"')
    expect(call).toContain('<script')
  })

  it('copy button shows Copied! feedback', async () => {
    render(<Integrations />)
    await screen.findByText(/pizza-palace/)
    fireEvent.click(screen.getByLabelText('Copy embed code'))
    await waitFor(() => expect(screen.getByText('Copied!')).toBeTruthy())
  })

  it('colour picker change: saveIntegrations called with new color (debounced 300ms)', async () => {
    render(<Integrations />)
    await screen.findByText('Brand colours')
    const primaryPicker = screen.getByLabelText('primary colour') as HTMLInputElement
    fireEvent.change(primaryPicker, { target: { value: '#ff0000' } })
    await waitFor(
      () => expect(mockSaveIntegrations).toHaveBeenCalledWith(
        expect.objectContaining({
          brand_colors: expect.objectContaining({ primary: '#ff0000' }),
        }),
      ),
      { timeout: 1000 },
    )
  })

  it('invalid URL in social link: inline validation error', async () => {
    render(<Integrations />)
    await screen.findByText('Social links')
    const facebookInput = screen.getByLabelText('Facebook URL')
    fireEvent.change(facebookInput, { target: { value: 'not-a-url' } })
    // Click save for Facebook row
    const saveButtons = screen.getAllByText('Save')
    // Find the one in the Facebook row by being near the Facebook input
    const facebookSave = facebookInput.closest('div')?.querySelector('button')!
    fireEvent.click(facebookSave)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('Invalid URL')
    expect(mockSaveIntegrations).not.toHaveBeenCalled()
  })

  it('valid URL in delivery link: saves successfully', async () => {
    render(<Integrations />)
    await screen.findByText('Delivery partners')
    const doordashInput = screen.getByLabelText('DoorDash URL')
    fireEvent.change(doordashInput, { target: { value: 'https://doordash.com/new' } })
    const doordashSave = doordashInput.closest('div')?.querySelector('button')!
    fireEvent.click(doordashSave)
    await waitFor(() => expect(mockSaveIntegrations).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_links: expect.objectContaining({ doordash: 'https://doordash.com/new' }),
      }),
    ))
  })

  it('embed code shows correct script tag', async () => {
    render(<Integrations />)
    const embedPre = await screen.findByText(/widget\.wolfchow\.com/)
    expect(embedPre.textContent).toContain('data-restaurant="pizza-palace"')
  })

  it('dark mode radio: updates selection', async () => {
    render(<Integrations />)
    await screen.findByText('Dark mode default')
    const darkRadio = screen.getByLabelText('Dark mode dark')
    fireEvent.click(darkRadio)
    await waitFor(() => expect((darkRadio as HTMLInputElement).checked).toBe(true))
  })

  it('widget preview iframe rendered', async () => {
    render(<Integrations />)
    await screen.findByText('Widget preview')
    const iframe = screen.getByLabelText('Widget preview')
    expect(iframe.tagName).toBe('IFRAME')
  })
})
