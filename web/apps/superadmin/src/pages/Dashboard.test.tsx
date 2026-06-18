import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import { ApiProvider } from '../lib/api'
import { Dashboard } from './Dashboard'

type SuperadminApi = ApiClient['superadmin']

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderDashboard(client: ApiClient) {
  return render(
    <ApiProvider client={client}>
      <Dashboard />
    </ApiProvider>,
  )
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

    renderDashboard(client)

    expect(await screen.findByText('3')).toBeInTheDocument() // total restaurants (summary rows)
    expect(screen.getByText('2')).toBeInTheDocument() // active restaurants (total)
    expect(screen.getByText('15')).toBeInTheDocument() // orders 30d (10+5+0)
    expect(screen.getByText('₺7,50')).toBeInTheDocument() // commission 30d (5+2.5)
  })

  it('loading: skeleton cards shown', () => {
    const client = fakeClient({
      getBilling: vi.fn<SuperadminApi['getBilling']>(() => new Promise(() => {})), // never resolves
      listRestaurants: vi.fn<SuperadminApi['listRestaurants']>(() => new Promise(() => {})),
    })
    renderDashboard(client)
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(4)
  })

  it('fetch error: error with retry shown, retry refetches', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ summary: [] })
    const listRestaurants = vi.fn(async () => ({ restaurants: [], page: 1, page_size: 20, total: 0 }))
    const client = fakeClient({ getBilling, listRestaurants })

    renderDashboard(client)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument()

    await userEvent.click(retry)

    // After a successful retry the cards render (0 restaurants).
    await waitFor(() => expect(screen.getByText('Total restaurants')).toBeInTheDocument())
    expect(getBilling).toHaveBeenCalledTimes(2)
  })
})
