import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Notifications } from './Notifications'
import type { AdminSmtpStatus, NotificationConfig } from '@wolfchow/api-client'

const mockGetAdminSmtp = vi.fn()
const mockSaveAdminSmtp = vi.fn()
const mockDeleteAdminSmtp = vi.fn()
const mockTestAdminSmtp = vi.fn()
const mockGetNotifications = vi.fn()
const mockPutNotifications = vi.fn()
const mockPreviewNotification = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      getAdminSmtp: mockGetAdminSmtp,
      saveAdminSmtp: mockSaveAdminSmtp,
      deleteAdminSmtp: mockDeleteAdminSmtp,
      testAdminSmtp: mockTestAdminSmtp,
      getNotifications: mockGetNotifications,
      putNotifications: mockPutNotifications,
      previewNotification: mockPreviewNotification,
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

const SMTP_NONE: AdminSmtpStatus = { smtp_source: null, monthly_limit: null, monthly_used: 0 }
const SMTP_OWN: AdminSmtpStatus = {
  smtp_source: 'own', host: 'smtp.example.com', port: 587,
  username: 'user@example.com', from_email: 'no-reply@example.com',
  from_name: 'RestroApp', monthly_limit: null, monthly_used: 0,
}
const SMTP_GLOBAL: AdminSmtpStatus = {
  smtp_source: 'global', monthly_limit: 1000, monthly_used: 450,
  host: null, port: null, username: null, from_email: null, from_name: null,
}

const ACCEPTED_CONFIG: NotificationConfig = {
  trigger_status: 'accepted', send_customer: true, internal_recipients: [], template_override: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetAdminSmtp.mockResolvedValue(SMTP_NONE)
  mockGetNotifications.mockResolvedValue([ACCEPTED_CONFIG])
})

describe('STORY-062 · SMTP & notification configuration UI', () => {
  it('SMTP source badge: not configured when smtp_source is null', async () => {
    render(<Notifications />)
    await screen.findByText('Not configured')
    expect(screen.queryByText('Your SMTP')).toBeNull()
  })

  it('platform global: shows usage bar info', async () => {
    mockGetAdminSmtp.mockResolvedValue(SMTP_GLOBAL)
    render(<Notifications />)
    await screen.findByText(/Platform global/)
    expect(screen.getByText('450/1000 emails this month')).toBeTruthy()
  })

  it('own SMTP: shows update button and test button', async () => {
    mockGetAdminSmtp.mockResolvedValue(SMTP_OWN)
    render(<Notifications />)
    await screen.findByText('Update SMTP settings')
    expect(screen.getByText('Test')).toBeTruthy()
  })

  it('invalid email chip: rejected', async () => {
    render(<Notifications />)
    await screen.findByText('Order Accepted')
    // Multiple rows — use the first input
    const chipInputs = screen.getAllByLabelText('Add internal recipient email')
    const chipInput = chipInputs[0]
    fireEvent.change(chipInput, { target: { value: 'not-an-email' } })
    fireEvent.keyDown(chipInput, { key: 'Enter' })
    // Invalid email should NOT be added as chip
    expect(screen.queryByText('not-an-email')).toBeNull()
  })

  it('valid email chip: accepted and shown', async () => {
    render(<Notifications />)
    await screen.findByText('Order Accepted')
    // Find the first email chip input (for first config row)
    const chipInputs = screen.getAllByLabelText('Add internal recipient email')
    const acceptedInput = chipInputs[0]
    fireEvent.change(acceptedInput, { target: { value: 'chef@restaurant.com' } })
    fireEvent.keyDown(acceptedInput, { key: 'Enter' })
    await waitFor(() => screen.getByText('chef@restaurant.com'))
    expect(screen.getByText('chef@restaurant.com')).toBeTruthy()
  })

  it('save all: putNotifications called with all 10 stages', async () => {
    mockPutNotifications.mockResolvedValue([ACCEPTED_CONFIG])
    render(<Notifications />)
    await screen.findByText('Save all')
    fireEvent.click(screen.getByText('Save all'))
    await waitFor(() => expect(mockPutNotifications).toHaveBeenCalled())
    expect(mockPutNotifications.mock.calls[0][0]).toHaveLength(10)
  })

  it('preview button: opens modal for that stage', async () => {
    render(<Notifications />)
    await screen.findByText('Order Accepted')
    // Find the preview button for 'accepted'
    fireEvent.click(screen.getByLabelText('Preview email for Order Accepted'))
    const modal = await screen.findByRole('dialog', { name: 'Preview notification' })
    expect(modal).toBeTruthy()
    expect(modal.textContent).toContain('Order Accepted')
  })

  it('SMTP remove: confirmation fallback message shown', async () => {
    mockGetAdminSmtp.mockResolvedValue(SMTP_OWN)
    mockDeleteAdminSmtp.mockResolvedValue(undefined)
    mockGetAdminSmtp
      .mockResolvedValueOnce(SMTP_OWN)  // initial load
      .mockResolvedValue(SMTP_NONE)     // after delete
    render(<Notifications />)
    await screen.findByText('Remove')
    fireEvent.click(screen.getByText('Remove'))
    await screen.findByText("You'll fall back to the platform SMTP.")
    expect(screen.getByText('Confirm remove')).toBeTruthy()
  })
})
