import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { AuditEntry, RestaurantListItem } from '@wolfchow/types'
import { renderWithQuery } from '../lib/test-utils'
import { Audit } from './Audit'

type SuperadminApi = ApiClient['superadmin']

function entry(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'entry-1',
    restaurant_id: 'rest-abc',
    table_name: 'menu_items',
    operation: 'UPDATE',
    old_data: { name: 'Burger', price: 10 },
    new_data: { name: 'Burger Deluxe', price: 12 },
    user_id: 'user-1',
    user_name: 'Alice',
    ip_address: null,
    created_at: '2026-06-01T12:00:00Z',
    ...over,
  }
}

function restaurant(over: Partial<RestaurantListItem> = {}): RestaurantListItem {
  return {
    id: 'rest-abc',
    slug: 'burger-place',
    display_name: 'The Burger Place',
    plan_id: null,
    plan_name: null,
    active: true,
    override_commission_type: null,
    override_commission_value: null,
    billing_note: null,
    created_at: '2026-01-01T00:00:00Z',
    order_count_30d: 0,
    ...over,
  }
}

const listRestaurants = vi
  .fn<SuperadminApi['listRestaurants']>()
  .mockResolvedValue({ restaurants: [restaurant()], page: 1, page_size: 500, total: 1 })

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderAudit(client: ApiClient) {
  return renderWithQuery(<Audit />, client)
}

describe('STORY-056 · Audit log viewer UI', () => {
  it('restaurant dropdown: selecting a restaurant re-fetches with restaurant_id param', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [entry()], page: 1, page_size: 50, total: 1 })

    renderAudit(fakeClient({ listAudit, listRestaurants }))

    // Wait for restaurants data to load (option populated by TQ query)
    const select = await screen.findByRole('combobox', { name: /filter by restaurant/i })
    await screen.findByRole('option', { name: 'The Burger Place' })
    expect(select).toBeInTheDocument()
    await userEvent.selectOptions(select, 'rest-abc')

    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ restaurant_id: 'rest-abc' }),
      ),
    )
  })

  it('table shows restaurant name resolved from dropdown list', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [entry()], page: 1, page_size: 50, total: 1 })

    const { container } = renderAudit(fakeClient({ listAudit, listRestaurants }))

    // Wait for the audit table to render — "Update" badge only appears when auditQ resolves
    await screen.findByText('Update')

    // Scope to the tbody so we're not matching the dropdown <option> element
    const tbody = container.querySelector('tbody')!
    expect(within(tbody).getByText('The Burger Place')).toBeInTheDocument()
    // UUID shown as sub-text below the name
    expect(within(tbody).getByText('rest-abc')).toBeInTheDocument()
  })

  it('expand row: diff shows changed fields highlighted', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [entry()], page: 1, page_size: 50, total: 1 })

    renderAudit(fakeClient({ listAudit, listRestaurants }))

    // Wait for audit table to render — row only appears when auditQ resolves
    await screen.findByText('Update')
    await userEvent.click(screen.getByRole('row', { name: /menu_items/i }))

    expect(await screen.findByText('name')).toBeInTheDocument()
    expect(screen.getByText(/"Burger"/)).toBeInTheDocument()
    expect(screen.getByText(/"Burger Deluxe"/)).toBeInTheDocument()
    expect(screen.getByText('price')).toBeInTheDocument()
  })

  it('date range filter: passes date_from and date_to params', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [], page: 1, page_size: 50, total: 0 })

    renderAudit(fakeClient({ listAudit, listRestaurants }))

    await screen.findByText(/no audit entries/i)

    await userEvent.type(screen.getByLabelText('Date from'), '2026-06-01')
    await userEvent.type(screen.getByLabelText('Date to'), '2026-06-30')

    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ date_from: '2026-06-01', date_to: '2026-06-30' }),
      ),
    )
  })

  it('LOGIN entry shown with green Login badge', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({
        entries: [entry({ id: 'e-login', restaurant_id: null, table_name: 'auth', operation: 'LOGIN', old_data: null, new_data: { email: 'admin@example.com', role: 'superadmin' }, user_name: 'Admin' })],
        page: 1,
        page_size: 50,
        total: 1,
      })

    renderAudit(fakeClient({ listAudit, listRestaurants }))

    expect(await screen.findByText('Login')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})
