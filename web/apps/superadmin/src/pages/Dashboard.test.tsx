import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import { renderWithQuery } from '../lib/test-utils'
import { Dashboard } from './Dashboard'

type SuperadminApi = ApiClient['superadmin']

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

describe('STORY-049 · Dashboard', () => {
  it('summary cards render with values after fetch', async () => {
    const client = fakeClient({
      getBilling: vi.fn(async () => ({
        summary: [
          { total_orders_30d: 10, estimated_commission_30d: 5 },
          { total_orders_30d: 5, estimated_commission_30d: 2.5 },
          { total_orders_30d: 0, estimated_commission_30d: 0 },
        ],
      })),
      listRestaurants: vi.fn(async () => ({ restaurants: [], page: 1, page_size: 20, total: 2 })),
    })

    renderWithQuery(<Dashboard />, client)

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('₺7,50')).toBeInTheDocument()
  })

  it('loading: skeleton cards shown', () => {
    const client = fakeClient({
      getBilling: vi.fn<SuperadminApi['getBilling']>(() => new Promise(() => {})),
      listRestaurants: vi.fn<SuperadminApi['listRestaurants']>(() => new Promise(() => {})),
    })
    renderWithQuery(<Dashboard />, client)
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(4)
  })

  it('fetch error: error with retry shown, retry refetches', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ summary: [] })
    const listRestaurants = vi.fn(async () => ({ restaurants: [], page: 1, page_size: 20, total: 0 }))
    const client = fakeClient({ getBilling, listRestaurants })

    renderWithQuery(<Dashboard />, client)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()

    await userEvent.click(retry)

    await waitFor(() => expect(screen.getByText('Total restaurants')).toBeInTheDocument())
    expect(getBilling).toHaveBeenCalledTimes(2)
  })
})
