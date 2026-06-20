import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { FeatureFlags, Plan } from '@wolfchow/types'
import { ApiProvider } from '../lib/api'
import { Plans } from './Plans'

type SuperadminApi = ApiClient['superadmin']

function flags(): FeatureFlags {
  return {
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
  }
}

function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    name: 'Starter',
    staff_cap: 3,
    item_cap: 50,
    category_cap: 10,
    modifier_cap: 20,
    smtp_monthly_limit: 500,
    transaction_history_days: 30,
    feature_flags: flags(),
    payment_methods_allowed: ['card'],
    commission_type: 'percentage',
    is_public: false,
    created_at: '2026-01-01T00:00:00Z',
    restaurant_count: 0,
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

function renderPlans(client: ApiClient) {
  return render(
    <ApiProvider client={client}>
      <Plans />
    </ApiProvider>,
  )
}

describe('STORY-051 · Plans UI', () => {
  it('create plan: form valid, API called, plan appears in grid', async () => {
    const created = makePlan({ id: 'p2', name: 'Pro Max' })
    const listPlans = vi
      .fn<SuperadminApi['listPlans']>()
      .mockResolvedValueOnce({ plans: [] })
      .mockResolvedValueOnce({ plans: [created] })
    const createPlan = vi.fn<SuperadminApi['createPlan']>().mockResolvedValue(created)
    const client = fakeClient({ listPlans, createPlan })

    renderPlans(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Create plan' }))
    await userEvent.type(screen.getByLabelText('Plan name'), 'Pro Max')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(createPlan).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Pro Max', payment_methods_allowed: ['card'] }),
    )
    expect(await screen.findByText('Pro Max')).toBeInTheDocument()
  })

  it('payment_methods empty: submit blocked', async () => {
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [] })
    const createPlan = vi.fn<SuperadminApi['createPlan']>()
    const client = fakeClient({ listPlans, createPlan })

    renderPlans(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Create plan' }))
    await userEvent.type(screen.getByLabelText('Plan name'), 'No Methods')
    // Turn off the only (default) payment method.
    await userEvent.click(screen.getByRole('button', { name: 'Card' }))

    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(save).catch(() => {})
    expect(createPlan).not.toHaveBeenCalled()
  })

  it('delete plan with restaurants: button disabled', async () => {
    const listPlans = vi
      .fn<SuperadminApi['listPlans']>()
      .mockResolvedValue({ plans: [makePlan({ name: 'Busy', restaurant_count: 3 })] })
    const client = fakeClient({ listPlans })

    renderPlans(client)

    await screen.findByText('Busy')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('edit plan: form pre-filled, PATCH called on save', async () => {
    const plan = makePlan({ id: 'p9', name: 'Growth' })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan] })
    const updatePlan = vi.fn<SuperadminApi['updatePlan']>().mockResolvedValue(plan)
    const client = fakeClient({ listPlans, updatePlan })

    renderPlans(client)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const nameInput = screen.getByLabelText('Plan name')
    expect(nameInput).toHaveValue('Growth')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Growth+')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updatePlan).toHaveBeenCalledWith('p9', expect.objectContaining({ name: 'Growth+' }))
  })
})
