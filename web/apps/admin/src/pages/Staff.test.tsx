import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Staff } from './Staff'
import { ApiError } from '@wolfchow/api-client'
import type { StaffMember } from '@wolfchow/api-client'

const mockListStaff = vi.fn()
const mockInviteStaff = vi.fn()
const mockUpdateStaff = vi.fn()
const mockDeactivateStaff = vi.fn()
const mockCreateDevice = vi.fn()
const mockRevokeDevice = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listStaff: mockListStaff,
      inviteStaff: mockInviteStaff,
      updateStaff: mockUpdateStaff,
      deactivateStaff: mockDeactivateStaff,
      createDevice: mockCreateDevice,
      revokeDevice: mockRevokeDevice,
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

const ALICE: StaffMember = {
  id: 'u1',
  restaurant_id: 'r1',
  name: 'Alice',
  email: 'alice@example.com',
  phone: null,
  role: 'kitchen',
  permissions: ['orders:accept_reject', 'orders:status'],
  active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const DEVICE: StaffMember = {
  id: 'u2',
  restaurant_id: 'r1',
  name: 'Kitchen Tablet 1',
  email: '',
  phone: null,
  role: 'kitchen',
  permissions: ['orders:accept_reject'],
  active: true,
  created_at: '2026-01-01T00:00:00Z',
}

// Devices are identified by having device_id on the row (cast as unknown)
const DEVICE_WITH_ID = { ...DEVICE, device_id: 'dev1' } as unknown as StaffMember

beforeEach(() => {
  vi.resetAllMocks()
  mockListStaff.mockResolvedValue([ALICE])
})

describe('STORY-060 · Staff management UI', () => {
  it('permission chips: correct colours', async () => {
    render(<Staff />)
    await waitFor(() => screen.getByText('Alice'))
    expect(screen.getByText('Accept/Reject').className).toContain('purple')
    expect(screen.getByText('Order Status').className).toContain('blue')
  })

  it('invite at cap: 402 shown, invite button disabled', async () => {
    mockInviteStaff.mockRejectedValue(new ApiError(402, { error: 'plan_limit_reached' }))
    render(<Staff />)
    await waitFor(() => screen.getByText('Invite staff'))
    fireEvent.click(screen.getByText('Invite staff'))
    const dialog = screen.getByRole('dialog', { name: 'Invite staff' })
    const nameInput = dialog.querySelector('input[type="text"]')!
    fireEvent.change(nameInput, { target: { value: 'Bob' } })
    const emailInput = dialog.querySelector('input[type="email"]')!
    fireEvent.change(emailInput, { target: { value: 'bob@example.com' } })
    fireEvent.submit(dialog.querySelector('form')!)
    // After 402, Staff sets inviteAtCap=true → the main-page alert and disabled button appear
    await waitFor(() => expect(mockInviteStaff).toHaveBeenCalled())
    await waitFor(
      () => expect(screen.getByText('Invite staff').closest('button')!.disabled).toBe(true),
      { timeout: 2000 },
    )
  })

  it('deactivate: row greys out', async () => {
    mockDeactivateStaff.mockResolvedValue(undefined)
    render(<Staff />)
    await waitFor(() => screen.getByText('Alice'))
    fireEvent.click(screen.getByLabelText('Deactivate Alice'))
    const popover = await screen.findByText('Confirm')
    fireEvent.click(popover)
    await waitFor(() => expect(mockDeactivateStaff).toHaveBeenCalledWith('u1'))
    // Row should be greyed out (opacity-50 class)
    await waitFor(() => {
      const row = screen.getByText('Alice').closest('tr')!
      expect(row.className).toContain('opacity-50')
    })
  })

  it('device token shown once: cannot re-open', async () => {
    mockListStaff
      .mockResolvedValueOnce([ALICE])
      .mockResolvedValue([ALICE, DEVICE_WITH_ID])
    mockCreateDevice.mockResolvedValue({ device_token: 'dt_abc123xyz', staff: DEVICE })
    render(<Staff />)
    await waitFor(() => screen.getByText('Add device'))
    fireEvent.click(screen.getByText('Add device'))
    const nameInput = await screen.findByLabelText('Device name')
    fireEvent.change(nameInput, { target: { value: 'Kitchen Tablet 1' } })
    const form = screen.getByRole('dialog', { name: 'Add device' }).querySelector('form')!
    fireEvent.submit(form)
    // Token dialog appears
    await waitFor(() => screen.findByLabelText('Device token value'))
    expect(screen.getByLabelText('Device token value').textContent).toContain('dt_abc123xyz')
    // Close button available
    expect(screen.getByText('Done')).toBeTruthy()
    // Warning shown
    expect(screen.getByText(/not be shown again/)).toBeTruthy()
  })
})
