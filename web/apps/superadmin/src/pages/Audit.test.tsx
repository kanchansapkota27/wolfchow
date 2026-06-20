import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { AuditEntry } from '@wolfchow/types'
import { ToastProvider } from '@wolfchow/ui'
import { ApiProvider } from '../lib/api'
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
    created_at: '2026-06-01T12:00:00Z',
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderAudit(client: ApiClient) {
  return render(
    <ToastProvider>
      <ApiProvider client={client}>
        <Audit />
      </ApiProvider>
    </ToastProvider>,
  )
}

describe('STORY-056 · Audit log viewer UI', () => {
  it('filter by restaurant: re-fetches with restaurant_id param', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [entry()], page: 1, page_size: 50, total: 1 })
    renderAudit(fakeClient({ listAudit }))

    expect(await screen.findByText('menu_items')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()

    await userEvent.type(
      screen.getByRole('textbox', { name: /filter by restaurant id/i }),
      'rest-abc',
    )
    await userEvent.click(screen.getByRole('button', { name: /apply filters/i }))

    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ restaurant_id: 'rest-abc' }),
      ),
    )
  })

  it('expand row: diff shows changed fields highlighted', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [entry()], page: 1, page_size: 50, total: 1 })
    renderAudit(fakeClient({ listAudit }))

    await screen.findByText('menu_items')

    // Click the row to expand it
    await userEvent.click(screen.getByRole('row', { name: /menu_items/i }))

    // Diff should show the changed fields: name and price
    expect(await screen.findByText('name')).toBeInTheDocument()
    expect(screen.getByText(/"Burger"/)).toBeInTheDocument()
    expect(screen.getByText(/"Burger Deluxe"/)).toBeInTheDocument()
    expect(screen.getByText('price')).toBeInTheDocument()
  })

  it('date range filter: passes date_from and date_to query params', async () => {
    const listAudit = vi
      .fn<SuperadminApi['listAudit']>()
      .mockResolvedValue({ entries: [], page: 1, page_size: 50, total: 0 })
    renderAudit(fakeClient({ listAudit }))

    await screen.findByText(/no audit entries/i)

    await userEvent.type(screen.getByLabelText('Date from'), '2026-06-01')
    await userEvent.type(screen.getByLabelText('Date to'), '2026-06-30')
    await userEvent.click(screen.getByRole('button', { name: /apply filters/i }))

    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ date_from: '2026-06-01', date_to: '2026-06-30' }),
      ),
    )
  })
})
