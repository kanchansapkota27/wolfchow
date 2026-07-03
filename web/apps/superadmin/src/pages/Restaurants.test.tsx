import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApiClient } from '@wolfchow/api-client'
import type { Plan, Restaurant, RestaurantListItem } from '@wolfchow/types'
import { renderWithQuery } from '../lib/test-utils'
import { Restaurants } from './Restaurants'

type SuperadminApi = ApiClient['superadmin']

function item(display_name: string, slug: string, over: Partial<RestaurantListItem> = {}): RestaurantListItem {
  return {
    id: slug,
    slug,
    display_name,
    plan_id: 'plan-1',
    plan_name: 'Starter',
    active: true,
    override_commission_type: null,
    override_commission_value: null,
    billing_note: null,
    created_at: '2026-01-01T00:00:00Z',
    order_count_30d: 0,
    ...over,
  }
}

function plan(): Plan {
  return {
    id: 'plan-1',
    name: 'Starter',
    device_cap: 3,
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
    commission_type: 'percentage',
    commission_value: 0,
    is_public: false,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function restaurant(over: Partial<Restaurant> = {}): Restaurant {
  return {
    id: 'r1',
    slug: 'acme',
    display_name: 'Acme',
    business_name: 'Acme LLC',
    timezone: 'Europe/Istanbul',
    currency: 'TRY',
    address: {},
    logo_r2_key: null,
    brand_colors: {},
    cuisine_type: null,
    services_offered: [],
    social_links: {},
    delivery_links: {},
    plan_id: 'plan-1',
    override_commission_type: null,
    override_commission_value: null,
    billing_note: null,
    active: true,
    base_prep_minutes: 20,
    scheduling_interval: 15,
    future_days_allowed: 7,
    tax_enabled: false,
    tax_rate: 0,
    tax_inclusive: true,
    tips_enabled: false,
    tip_presets: [10, 15, 20],
    allow_custom_tip: true,
    show_no_tip: true,
    auto_accept: false,
    auto_reject_enabled: false,
    auto_reject_minutes: 10,
    orders_paused: false,
    pause_until: null,
    pause_reason: null,
    pause_mode: null,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function fakeClient(superadmin: Partial<SuperadminApi>): ApiClient {
  return { superadmin } as unknown as ApiClient
}

describe('STORY-050 · Restaurants UI', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
  afterEach(() => vi.useRealTimers())

  it('search filters table rows', async () => {
    const all = [item('Alpha Diner', 'alpha'), item('Beta Cafe', 'beta')]
    const listRestaurants = vi.fn<SuperadminApi['listRestaurants']>(async (query) => {
      const s = (query?.search as string | undefined)?.toLowerCase()
      const restaurants = s ? all.filter((r) => r.display_name.toLowerCase().includes(s)) : all
      return { restaurants, page: 1, page_size: 20, total: restaurants.length }
    })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    renderWithQuery(<Restaurants />, fakeClient({ listRestaurants, listPlans }))

    expect(await screen.findByText('Alpha Diner')).toBeInTheDocument()
    expect(screen.getByText('Beta Cafe')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Search restaurants'), 'Alpha')
    // Advance past the 300ms debounce
    await act(async () => { vi.advanceTimersByTime(350) })

    await waitFor(() => expect(screen.queryByText('Beta Cafe')).not.toBeInTheDocument())
    expect(screen.getByText('Alpha Diner')).toBeInTheDocument()
  })

  it('suspend: modal shown, API called, badge changes', async () => {
    const listRestaurants = vi
      .fn<SuperadminApi['listRestaurants']>()
      .mockResolvedValue({ restaurants: [item('Acme', 'acme', { id: 'r1' })], page: 1, page_size: 20, total: 1 })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const getRestaurant = vi.fn<SuperadminApi['getRestaurant']>().mockResolvedValue(restaurant())
    const suspendRestaurant = vi
      .fn<SuperadminApi['suspendRestaurant']>()
      .mockResolvedValue({ id: 'r1', active: false })
    renderWithQuery(<Restaurants />, fakeClient({ listRestaurants, listPlans, getRestaurant, suspendRestaurant }))

    await userEvent.click(await screen.findByText('Acme'))
    const panel = await screen.findByRole('dialog', { name: /restaurant acme/i })

    await userEvent.click(within(panel).getByRole('button', { name: 'Suspend' }))
    const confirm = await screen.findByRole('dialog', { name: 'Suspend restaurant' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }))

    expect(suspendRestaurant).toHaveBeenCalledWith('r1')
    await waitFor(() => expect(within(panel).getByText('Suspended')).toBeInTheDocument())
  })

  it('billing_note edit: Enter saves, Escape cancels', async () => {
    const listRestaurants = vi
      .fn<SuperadminApi['listRestaurants']>()
      .mockResolvedValue({ restaurants: [item('Acme', 'acme', { id: 'r1' })], page: 1, page_size: 20, total: 1 })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const getRestaurant = vi.fn<SuperadminApi['getRestaurant']>().mockResolvedValue(restaurant())
    const updateRestaurant = vi
      .fn<SuperadminApi['updateRestaurant']>()
      .mockResolvedValue({ id: 'r1', billing_note: 'VIP client' })
    renderWithQuery(<Restaurants />, fakeClient({ listRestaurants, listPlans, getRestaurant, updateRestaurant }))

    await userEvent.click(await screen.findByText('Acme'))
    await screen.findByRole('dialog', { name: /restaurant acme/i })

    // Enter saves.
    await userEvent.click(screen.getByRole('button', { name: 'Billing note' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Billing note' }), 'VIP client{Enter}')
    expect(updateRestaurant).toHaveBeenCalledWith('r1', { billing_note: 'VIP client' })

    // Escape cancels (no further call).
    await userEvent.click(screen.getByRole('button', { name: 'Billing note' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Billing note' }), 'discard{Escape}')
    expect(updateRestaurant).toHaveBeenCalledTimes(1)
  })

  it('impersonate: token handed off via postMessage, never in the URL', async () => {
    const listRestaurants = vi
      .fn<SuperadminApi['listRestaurants']>()
      .mockResolvedValue({ restaurants: [item('Acme', 'acme', { id: 'r1' })], page: 1, page_size: 20, total: 1 })
    const listPlans = vi.fn<SuperadminApi['listPlans']>().mockResolvedValue({ plans: [plan()] })
    const getRestaurant = vi.fn<SuperadminApi['getRestaurant']>().mockResolvedValue(restaurant())
    const impersonate = vi
      .fn<SuperadminApi['impersonate']>()
      .mockResolvedValue({ access_token: 'imp_tok_123', expires_in: 1800 })
    const postMessage = vi.fn()
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue({ postMessage } as unknown as Window)
    renderWithQuery(<Restaurants />, fakeClient({ listRestaurants, listPlans, getRestaurant, impersonate }))

    await userEvent.click(await screen.findByText('Acme'))
    const panel = await screen.findByRole('dialog', { name: /restaurant acme/i })
    await userEvent.click(within(panel).getByRole('button', { name: /view as admin/i }))

    // Admin app opened with NO token in the URL.
    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(String(openSpy.mock.calls[0]![0])).not.toContain('imp_tok_123')

    // Token is only delivered after the admin app signals readiness, scoped to origin.
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'http://localhost:5174', data: 'impersonation:ready' }),
    )
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'impersonation:token', access_token: 'imp_tok_123' },
        'http://localhost:5174',
      ),
    )
    openSpy.mockRestore()
  })
})
