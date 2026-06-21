import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Hours } from './Hours'
import type { HoursRow, SchedulingConfig, SpecialClosure } from '@wolfchow/api-client'

const mockGetHours = vi.fn()
const mockPutHours = vi.fn()
const mockGetScheduling = vi.fn()
const mockPatchScheduling = vi.fn()
const mockGetSchedulingPreview = vi.fn()
const mockListClosures = vi.fn()
const mockCreateClosure = vi.fn()
const mockDeleteClosure = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({
    admin: {
      getHours: mockGetHours,
      putHours: mockPutHours,
      getScheduling: mockGetScheduling,
      patchScheduling: mockPatchScheduling,
      getSchedulingPreview: mockGetSchedulingPreview,
      listClosures: mockListClosures,
      createClosure: mockCreateClosure,
      deleteClosure: mockDeleteClosure,
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

const DEFAULT_HOURS: HoursRow[] = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '21:00',
  active: i > 0 && i < 6,
  last_order_offset_minutes: 0,
}))

const SCHEDULING: SchedulingConfig = {
  base_prep_minutes: 20,
  scheduling_interval: 15,
  future_days_allowed: 7,
}

const SLOT_ISO = new Date(Date.now() + 3600000).toISOString()

const CLOSURE: SpecialClosure = {
  id: 'c1',
  restaurant_id: 'r1',
  closure_type: 'holiday',
  date: '2026-12-25',
  partial_open: null,
  partial_close: null,
  recurring: true,
  reason: 'Christmas Day',
  created_at: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockGetHours.mockResolvedValue(DEFAULT_HOURS)
  mockGetScheduling.mockResolvedValue(SCHEDULING)
  mockGetSchedulingPreview.mockResolvedValue([SLOT_ISO])
  mockListClosures.mockResolvedValue([CLOSURE])
})

describe('STORY-059 · Hours & scheduling UI', () => {
  it('close time before open time: overnight badge shown', async () => {
    const hours = DEFAULT_HOURS.map((r) =>
      r.day_of_week === 1 ? { ...r, active: true, open_time: '22:00', close_time: '02:00' } : r
    )
    mockGetHours.mockResolvedValue(hours)
    render(<Hours />)
    await screen.findByText('Monday')
    expect(screen.getByText('Overnight')).toBeTruthy()
  })

  it('save hours: PUT called with all 7 days', async () => {
    mockPutHours.mockResolvedValue(DEFAULT_HOURS)
    render(<Hours />)
    await screen.findByText('Save all hours')
    fireEvent.click(screen.getByText('Save all hours'))
    await waitFor(() => expect(mockPutHours).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ day_of_week: 0 }),
      expect.objectContaining({ day_of_week: 6 }),
    ])))
    expect(mockPutHours.mock.calls[0][0]).toHaveLength(7)
  })

  it('slot preview: updates after prep time change (debounced)', async () => {
    mockPatchScheduling.mockResolvedValue({ ...SCHEDULING, base_prep_minutes: 30 })
    mockGetSchedulingPreview.mockResolvedValue([SLOT_ISO])
    render(<Hours />)
    const prepInput = await screen.findByLabelText('Prep time')
    fireEvent.change(prepInput, { target: { value: '30' } })
    // Debounce fires after 500ms — wait up to 2s
    await waitFor(
      () => expect(mockPatchScheduling).toHaveBeenCalledWith({ base_prep_minutes: 30 }),
      { timeout: 2000 },
    )
    await waitFor(() => expect(mockGetSchedulingPreview).toHaveBeenCalledTimes(2), { timeout: 2000 })
  })

  it('add partial closure without times: form invalid (native required)', async () => {
    render(<Hours />)
    await screen.findByText('Add closure')
    fireEvent.click(screen.getByText('Add closure'))
    const dialog = await screen.findByRole('dialog', { name: 'Add closure' })
    // Check the "Partial closure" checkbox (first checkbox in the modal)
    const partialCheckbox = dialog.querySelector('input[type="checkbox"]')!
    fireEvent.click(partialCheckbox)
    // Submit the form without filling in the partial times
    const form = dialog.querySelector('form')!
    fireEvent.submit(form)
    // Our JS guard fires: error alert appears
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toContain('Partial closures require both')
    expect(mockCreateClosure).not.toHaveBeenCalled()
  })
})
