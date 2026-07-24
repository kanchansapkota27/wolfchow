import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DeviceOfflineBanner } from './DeviceOfflineBanner'

const mockListDevices = vi.fn()

vi.mock('../lib/api', () => ({
  useApi: () => ({ admin: { listDevices: mockListDevices } }),
}))

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeviceOfflineBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DeviceOfflineBanner', () => {
  it('no devices ever configured: shows the "never set up" message', async () => {
    mockListDevices.mockResolvedValue({ devices: [], device_cap: 3, device_count: 0 })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/No kitchen tablet has ever been set up/)).toBeInTheDocument())
  })

  it('devices exist but none recently seen: shows the offline message', async () => {
    mockListDevices.mockResolvedValue({
      devices: [{ id: 'd1', restaurant_id: 'r1', name: 'Kitchen iPad', permissions: [], device_uuid: null, platform: null, last_seen_at: new Date(Date.now() - 30 * 60_000).toISOString(), created_at: '2026-01-01T00:00:00Z' }],
      device_cap: 3,
      device_count: 1,
    })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/No kitchen tablet is currently online/)).toBeInTheDocument())
    expect(screen.getByText('Manage devices')).toBeInTheDocument()
  })

  it('a device sent a heartbeat recently: no banner shown', async () => {
    mockListDevices.mockResolvedValue({
      devices: [{ id: 'd1', restaurant_id: 'r1', name: 'Kitchen iPad', permissions: [], device_uuid: null, platform: null, last_seen_at: new Date(Date.now() - 2 * 60_000).toISOString(), created_at: '2026-01-01T00:00:00Z' }],
      device_cap: 3,
      device_count: 1,
    })
    renderBanner()
    await waitFor(() => expect(mockListDevices).toHaveBeenCalled())
    expect(screen.queryByText(/No kitchen tablet/)).not.toBeInTheDocument()
  })

  it('at least one of several devices is online: no banner shown', async () => {
    mockListDevices.mockResolvedValue({
      devices: [
        { id: 'd1', restaurant_id: 'r1', name: 'Front iPad', permissions: [], device_uuid: null, platform: null, last_seen_at: new Date(Date.now() - 30 * 60_000).toISOString(), created_at: '2026-01-01T00:00:00Z' },
        { id: 'd2', restaurant_id: 'r1', name: 'Kitchen iPad', permissions: [], device_uuid: null, platform: null, last_seen_at: new Date(Date.now() - 1 * 60_000).toISOString(), created_at: '2026-01-01T00:00:00Z' },
      ],
      device_cap: 3,
      device_count: 2,
    })
    renderBanner()
    await waitFor(() => expect(mockListDevices).toHaveBeenCalled())
    expect(screen.queryByText(/No kitchen tablet/)).not.toBeInTheDocument()
  })
})
