import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { BillingMonthRow, BillingSummaryRow } from '@wolfchow/types'
import { renderWithQuery } from '../lib/test-utils'
import { Billing } from './Billing'

type SuperadminApi = ApiClient['superadmin']

function row(over: Partial<BillingSummaryRow> = {}): BillingSummaryRow {
  return {
    id: 'rest-abc',
    display_name: 'The Burger Place',
    slug: 'burger-place',
    plan_id: 'plan-1',
    effective_commission_type: 'percentage',
    effective_commission_value: 500,
    billing_note: null,
    total_orders: 200,
    total_order_value: 10000,
    total_orders_30d: 45,
    total_order_value_30d: 2250,
    estimated_commission_30d: 112.5,
    ...over,
  }
}

function monthRow(over: Partial<BillingMonthRow> = {}): BillingMonthRow {
  return {
    month: '2026-01-01',
    order_count: 30,
    order_value: 1500,
    estimated_commission: 75,
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderBilling(client: ApiClient) {
  return renderWithQuery(<Billing />, client)
}

describe('STORY-054 · Billing UI — summary table', () => {
  it('renders summary row with effective commission and 30d figures', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: false })
    const client = fakeClient({ getBilling })

    renderBilling(client)

    expect(await screen.findByText('The Burger Place')).toBeInTheDocument()
    expect(screen.getByText('burger-place')).toBeInTheDocument()
    expect(screen.getByText('5.00%')).toBeInTheDocument()
    // 30d order count (appears in totals card AND table row — assert at least one)
    expect(screen.getAllByText('45').length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty-state when no restaurants', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [], cached: false })
    const client = fakeClient({ getBilling })

    renderBilling(client)

    expect(await screen.findByText(/no restaurants yet/i)).toBeInTheDocument()
  })

  it('shows cached indicator when cached=true', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: true })
    const client = fakeClient({ getBilling })

    renderBilling(client)

    expect(await screen.findByText(/cached/i)).toBeInTheDocument()
  })

  it('shows error state on fetch failure', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockRejectedValue(new Error('network'))
    const client = fakeClient({ getBilling })

    renderBilling(client)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})

describe('STORY-054 · Billing UI — inline billing note', () => {
  it('click note shows input; Enter saves via updateRestaurant', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row({ billing_note: null })], cached: false })
    const updateRestaurant = vi
      .fn<SuperadminApi['updateRestaurant']>()
      .mockResolvedValue({})
    const client = fakeClient({ getBilling, updateRestaurant })

    renderBilling(client)

    await userEvent.click(await screen.findByTitle('Click to edit billing note'))

    const noteInput = screen.getByTestId('billing-note-input')
    await userEvent.type(noteInput, 'Net 30')
    await userEvent.keyboard('{Enter}')

    await waitFor(() =>
      expect(updateRestaurant).toHaveBeenCalledWith('rest-abc', { billing_note: 'Net 30' }),
    )
  })

  it('Escape cancels edit without saving', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row({ billing_note: 'existing' })], cached: false })
    const updateRestaurant = vi
      .fn<SuperadminApi['updateRestaurant']>()
      .mockResolvedValue({})
    const client = fakeClient({ getBilling, updateRestaurant })

    renderBilling(client)

    await userEvent.click(await screen.findByTitle('Click to edit billing note'))
    await userEvent.keyboard('{Escape}')

    expect(updateRestaurant).not.toHaveBeenCalled()
    // Original note text should be back
    expect(screen.getByText('existing')).toBeInTheDocument()
  })

  it('save failure shows error toast', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: false })
    const updateRestaurant = vi
      .fn<SuperadminApi['updateRestaurant']>()
      .mockRejectedValue(new Error('500'))
    const client = fakeClient({ getBilling, updateRestaurant })

    renderBilling(client)

    await userEvent.click(await screen.findByTitle('Click to edit billing note'))
    const noteInput = screen.getByTestId('billing-note-input')
    await userEvent.type(noteInput, 'Test note')
    await userEvent.keyboard('{Enter}')

    await screen.findByText(/failed to save billing note/i)
  })
})

describe('STORY-054 · Billing UI — monthly drilldown', () => {
  it('Details button opens modal with Recharts chart and table', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: false })
    const getRestaurantBilling = vi
      .fn<SuperadminApi['getRestaurantBilling']>()
      .mockResolvedValue({ months: [monthRow(), monthRow({ month: '2026-02-01', order_count: 40 })] })
    const client = fakeClient({ getBilling, getRestaurantBilling })

    renderBilling(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))

    const dialog = await screen.findByRole('dialog', { name: /The Burger Place/i })
    expect(within(dialog).getByText(/5\.00%/)).toBeInTheDocument()
    // Table month labels
    expect(within(dialog).getByText('Jan 2026')).toBeInTheDocument()
    // Order counts in table
    expect(within(dialog).getByText('30')).toBeInTheDocument()
    expect(within(dialog).getByText('40')).toBeInTheDocument()

    expect(getRestaurantBilling).toHaveBeenCalledWith('rest-abc')
  })

  it('shows empty state for restaurant with no orders', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: false })
    const getRestaurantBilling = vi
      .fn<SuperadminApi['getRestaurantBilling']>()
      .mockResolvedValue({ months: [] })
    const client = fakeClient({ getBilling, getRestaurantBilling })

    renderBilling(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Details' }))

    await screen.findByText(/no captured orders yet/i)
  })
})

describe('STORY-054 · Billing UI — CSV export', () => {
  it('Export CSV button is disabled when no rows', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [], cached: false })
    const client = fakeClient({ getBilling })

    renderBilling(client)

    const btn = await screen.findByRole('button', { name: 'Export CSV' })
    expect(btn).toBeDisabled()
  })

  it('Export CSV button is enabled with rows', async () => {
    const getBilling = vi
      .fn<SuperadminApi['getBilling']>()
      .mockResolvedValue({ summary: [row()], cached: false })
    const client = fakeClient({ getBilling })

    renderBilling(client)

    // Wait for data to load before asserting the button is enabled
    await screen.findByText('The Burger Place')
    const btn = screen.getByRole('button', { name: 'Export CSV' })
    expect(btn).not.toBeDisabled()
  })
})
