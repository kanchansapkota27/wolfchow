import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { InviteStatus, InviteSummary, Plan } from '@wolfchow/types'
import { renderWithQuery } from '../lib/test-utils'
import { Invites } from './Invites'

type SuperadminApi = ApiClient['superadmin']

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    name: 'Starter',
    staff_cap: 3,
    item_cap: 50,
    category_cap: 10,
    modifier_cap: 20,
    smtp_monthly_limit: 500,
    transaction_history_days: 30,
    feature_flags: {
      menu_photos: false,
      item_modifiers: false,
      category_scheduling: false,
      email_notifications: true,
      order_tracking_page: false,
      analytics_dashboard: false,
      export_orders_csv: false,
      custom_brand_color: false,
      remove_powered_by: false,
      promotions_enabled: false,
      scheduled_orders_enabled: false,
    },
    payment_methods_allowed: ['card'],
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function invite(status: InviteStatus, over: Partial<InviteSummary> = {}): InviteSummary {
  return {
    id: `inv-${status}`,
    token: `inv_${status}0123456789abcdef`,
    plan_id: 'plan-1',
    commission_rate: 0.05,
    billing_note: null,
    email: null,
    restaurant_name: null,
    expires_at: '2026-12-31T00:00:00Z',
    created_at: '2026-06-01T00:00:00Z',
    used_at: null,
    status,
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderInvites(client: ApiClient) {
  return renderWithQuery(<Invites />, client)
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('STORY-052 · Invites UI', () => {
  it('generate invite: URL displayed, copy button works', async () => {
    const listInvites = vi.fn<SuperadminApi['listInvites']>().mockResolvedValue({ invites: [] })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const createInvite = vi.fn<SuperadminApi['createInvite']>().mockResolvedValue({
      id: 'inv-9',
      token: 'inv_abc',
      invite_url: 'https://admin.example.com/signup?invite=inv_abc',
      expires_at: '2026-12-31T00:00:00Z',
    })
    const client = fakeClient({ listInvites, listPlans, createInvite })

    renderInvites(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Generate invite' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

    const url = await screen.findByTestId('invite-url')
    expect(url).toHaveTextContent('https://admin.example.com/signup?invite=inv_abc')
    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ plan_id: 'plan-1', commission_rate: 0 }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://admin.example.com/signup?invite=inv_abc',
    )
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument()
  })

  it('revoke: confirm shown, on confirm row shows revoked badge', async () => {
    const listInvites = vi
      .fn<SuperadminApi['listInvites']>()
      .mockResolvedValueOnce({ invites: [invite('pending')] })
      .mockResolvedValueOnce({ invites: [invite('revoked')] })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const revokeInvite = vi.fn<SuperadminApi['revokeInvite']>().mockResolvedValue(undefined)
    const client = fakeClient({ listInvites, listPlans, revokeInvite })

    renderInvites(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    // Confirm dialog
    const dialog = await screen.findByRole('dialog', { name: 'Revoke invite' })
    expect(dialog).toHaveTextContent(/revoke this invite/i)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }))

    expect(revokeInvite).toHaveBeenCalledWith('inv-pending')
    await waitFor(() => expect(screen.getByText('Revoked')).toBeInTheDocument())
  })

  it('used invite: row shows used badge, no revoke button', async () => {
    const listInvites = vi
      .fn<SuperadminApi['listInvites']>()
      .mockResolvedValue({ invites: [invite('used', { used_at: '2026-06-02T00:00:00Z' })] })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const client = fakeClient({ listInvites, listPlans })

    renderInvites(client)

    expect(await screen.findByText('Used')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
  })
})
