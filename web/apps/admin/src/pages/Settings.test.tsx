import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from './Settings'
import type { Restaurant } from '@wolfchow/types'

const mockGetRestaurant = vi.fn()
const mockPatchRestaurant = vi.fn()
const mockPatchProfile = vi.fn()
const mockChangePassword = vi.fn()
const mockGetLogoUploadUrl = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      getRestaurant: mockGetRestaurant,
      patchRestaurant: mockPatchRestaurant,
      patchProfile: mockPatchProfile,
      changePassword: mockChangePassword,
      getLogoUploadUrl: mockGetLogoUploadUrl,
    },
  }),
}))

vi.mock('@wolfchow/ui', () => ({
  Button: ({ children, onClick, loading }: { children: React.ReactNode; onClick?: () => void; loading?: boolean }) => (
    <button onClick={onClick} disabled={loading}>{children}</button>
  ),
  Input: ({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; [key: string]: unknown }) => (
    <div>
      {label && <label>{label}</label>}
      <input aria-label={label || undefined} value={value} onChange={onChange} {...rest} />
    </div>
  ),
}))

const RESTAURANT: Restaurant = {
  id: 'r1',
  slug: 'test-restaurant',
  display_name: 'Test Display',
  business_name: 'Test Business',
  timezone: 'America/New_York',
  currency: 'USD',
  address: { line1: '123 Main St', city: 'New York', country: 'US' },
  logo_r2_key: null,
  brand_colors: {},
  cuisine_type: 'Italian',
  services_offered: ['togo'],
  social_links: {},
  delivery_links: {},
  plan_id: 'plan1',
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
  tips_enabled: false,
  tip_presets: [],
  allow_custom_tip: false,
  show_no_tip: false,
  auto_accept: false,
  auto_reject_enabled: false,
  auto_reject_minutes: 15,
  menu_image_display: 'both',
  special_requests_enabled: true,
  orders_paused: false,
  pause_until: null,
  pause_reason: null,
  pause_mode: null,
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetRestaurant.mockResolvedValue(RESTAURANT)
})

describe('STORY-067 · Restaurant settings UI', () => {
  it('save display_name: API called with updated name', async () => {
    mockPatchRestaurant.mockResolvedValue({})
    render(<Settings />)
    await waitFor(() => screen.getByLabelText('Display name'))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Display' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(mockPatchRestaurant).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'New Display' }),
    ))
  })

  it('slug field: not editable, lock icon visible', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByText('test-restaurant'))
    const slugValue = screen.getByText('test-restaurant')
    expect(slugValue.tagName).not.toBe('INPUT')
    expect(screen.getByText('Contact support to change your URL slug.')).toBeTruthy()
  })

  it('password mismatch: inline error shown, API not called', async () => {
    render(<Settings />)
    await waitFor(() => screen.getByLabelText('Current password'))
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-pass' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass1' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpass2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(screen.getByText(/passwords do not match/i)).toBeTruthy())
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('logo upload: progress shown, upload URL obtained', async () => {
    mockGetLogoUploadUrl.mockResolvedValue({ upload_url: 'http://r2.example.com/put', r2_key: 'logos/r1.jpg' })
    const xhrMock = {
      upload: { onprogress: null as unknown },
      onload: null as unknown,
      onerror: null as unknown,
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn().mockImplementation(function (this: { onload: () => void }) { setTimeout(() => this.onload(), 0) }),
      status: 200,
    }
    vi.stubGlobal('XMLHttpRequest', vi.fn(() => xhrMock))

    render(<Settings />)
    await waitFor(() => screen.getByLabelText('Upload logo'))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['img'], 'logo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockGetLogoUploadUrl).toHaveBeenCalled())
    vi.unstubAllGlobals()
  })
})
