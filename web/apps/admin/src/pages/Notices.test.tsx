import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Notices } from './Notices'
import type { Notice } from '@wolfchow/api-client'

const mockListNotices = vi.fn()
const mockCreateNotice = vi.fn()
const mockUpdateNotice = vi.fn()
const mockDeleteNotice = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      listNotices: mockListNotices,
      createNotice: mockCreateNotice,
      updateNotice: mockUpdateNotice,
      deleteNotice: mockDeleteNotice,
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

const NOTICE_INFO: Notice = {
  id: 'notice-1',
  restaurant_id: 'rest-1',
  type: 'informational',
  message: 'Kitchen closed early today',
  display_locations: ['storefront', 'checkout'],
  priority: 0,
  starts_at: null,
  expires_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

const NOTICE_EMERGENCY: Notice = {
  ...NOTICE_INFO,
  id: 'notice-2',
  type: 'emergency',
  message: 'Gas leak — restaurant closed',
}

// Expired notice: expires_at in the past
const NOTICE_EXPIRED: Notice = {
  ...NOTICE_INFO,
  id: 'notice-3',
  type: 'warning',
  message: 'Temporary outage',
  expires_at: '2020-01-01T00:00:00Z',
}

// Scheduled notice: starts_at in the future
const NOTICE_SCHEDULED: Notice = {
  ...NOTICE_INFO,
  id: 'notice-4',
  type: 'promotional',
  message: 'Coming soon: happy hour!',
  starts_at: '2099-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockListNotices.mockResolvedValue([NOTICE_INFO])
})

describe('STORY-064 · notices & announcements UI', () => {
  it('emergency notice: red badge', async () => {
    mockListNotices.mockResolvedValue([NOTICE_EMERGENCY])
    render(<Notices />)
    await screen.findByText('Gas leak — restaurant closed')
    const badge = screen.getByLabelText('emergency badge')
    expect(badge.className).toContain('red')
  })

  it('message at 200 chars: counter shows 200, submit allowed', async () => {
    mockListNotices.mockResolvedValue([])
    mockCreateNotice.mockResolvedValue({ ...NOTICE_INFO, message: 'x'.repeat(200) })
    render(<Notices />)
    await screen.findByText('No notices yet')
    fireEvent.click(screen.getByText('Create notice'))
    const dialog = await screen.findByRole('dialog')
    const textarea = dialog.querySelector('[aria-label="Message"]') as HTMLTextAreaElement
    const msg200 = 'a'.repeat(200)
    fireEvent.change(textarea, { target: { value: msg200 } })
    await waitFor(() => expect(textarea.value).toBe(msg200))
    // Counter shows "0 remaining"
    expect(dialog.textContent).toContain('0 remaining')
    // Submit is allowed — form can be submitted
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(mockCreateNotice).toHaveBeenCalled())
  })

  it('message at 201 chars: input blocked (capped at 200)', async () => {
    mockListNotices.mockResolvedValue([])
    render(<Notices />)
    await screen.findByText('No notices yet')
    fireEvent.click(screen.getByText('Create notice'))
    const dialog = await screen.findByRole('dialog')
    const textarea = dialog.querySelector('[aria-label="Message"]') as HTMLTextAreaElement
    // Try to type 201 chars
    fireEvent.change(textarea, { target: { value: 'a'.repeat(201) } })
    // Should be capped at 200 — onChange guard prevents update
    await waitFor(() => expect(textarea.value.length).toBeLessThanOrEqual(200))
  })

  it('informational notice: blue badge', async () => {
    render(<Notices />)
    await screen.findByText('Kitchen closed early today')
    const badge = screen.getByLabelText('informational badge')
    expect(badge.className).toContain('blue')
  })

  it('expired notice: shown with opacity-50', async () => {
    mockListNotices.mockResolvedValue([NOTICE_EXPIRED])
    render(<Notices />)
    await screen.findByText('Temporary outage')
    const row = screen.getByText('Temporary outage').closest('.rounded-xl')!
    expect(row.className).toContain('opacity-50')
  })

  it('scheduled notice: shows scheduled status', async () => {
    mockListNotices.mockResolvedValue([NOTICE_SCHEDULED])
    render(<Notices />)
    await screen.findByText('Coming soon: happy hour!')
    expect(screen.getByText('scheduled')).toBeTruthy()
  })

  it('active count banner: shows when notices are active', async () => {
    render(<Notices />)
    await screen.findByText('Kitchen closed early today')
    expect(screen.getByText(/1 active notice →/)).toBeTruthy()
  })

  it('create notice: calls createNotice and appears in list', async () => {
    const newNotice: Notice = { ...NOTICE_INFO, id: 'notice-99', message: 'New message' }
    mockCreateNotice.mockResolvedValue(newNotice)
    render(<Notices />)
    await screen.findByText('Kitchen closed early today')
    fireEvent.click(screen.getByText('Create notice'))
    const dialog = await screen.findByRole('dialog')
    const textarea = dialog.querySelector('[aria-label="Message"]') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'New message' } })
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(mockCreateNotice).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('New message')).toBeTruthy())
  })

  it('delete notice: confirm then removed from list', async () => {
    mockDeleteNotice.mockResolvedValue(undefined)
    render(<Notices />)
    await screen.findByText('Kitchen closed early today')
    fireEvent.click(screen.getByLabelText('Delete notice'))
    const confirmBtn = await screen.findByText('Confirm')
    fireEvent.click(confirmBtn)
    await waitFor(() => expect(mockDeleteNotice).toHaveBeenCalledWith('notice-1'))
    await waitFor(() => expect(screen.queryByText('Kitchen closed early today')).toBeNull())
  })
})
