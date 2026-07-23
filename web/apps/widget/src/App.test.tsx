import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { WidgetSettings, PublicMenuCategory } from './types'
import { App } from './App'
import { injectCssVars, mountWidgetInShadow } from './bootstrap'

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// ── Realtime mock ────────────────────────────────────────────────────────────

type RealtimeHandler = (event: string, payload: Record<string, unknown>) => void
const realtimeHandlers = new Map<string, Set<RealtimeHandler>>()

function fireRealtimeEvent(event: string, payload: Record<string, unknown>) {
  act(() => {
    realtimeHandlers.get(event)?.forEach((h) => h(event, payload))
  })
}

vi.mock('@wolfchow/realtime', () => ({
  RealtimeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRealtime: () => ({
    status: 'connected',
    connected: true,
    subscribe: (event: string, handler: RealtimeHandler) => {
      if (!realtimeHandlers.has(event)) realtimeHandlers.set(event, new Set())
      realtimeHandlers.get(event)!.add(handler)
      return () => realtimeHandlers.get(event)?.delete(handler)
    },
  }),
}))

// ── API mock ─────────────────────────────────────────────────────────────────

const mockGetMenu = vi.fn<() => Promise<PublicMenuCategory[]>>()

vi.mock('./api', () => ({
  createWidgetApi: () => ({
    getMenu: mockGetMenu,
    getSlots: vi.fn(),
    validatePromo: vi.fn(),
    createOrder: vi.fn(),
    confirmOrder: vi.fn(),
    getOrderTracking: vi.fn(),
  }),
  WidgetApiError: class WidgetApiError extends Error {},
}))

const SETTINGS: WidgetSettings = {
  restaurant_id: 'rest-1',
  slug: 'acme',
  display_name: 'Acme Burgers',
  logo_url: null,
  font_family: 'Georgia, serif',
  brand_colors: {
    primary: '#ff0000',
    secondary: '#00ff00',
    accent: '#0000ff',
    text: '#111111',
  },
  currency: 'USD',
  timezone: 'America/New_York',
  payment_methods: ['card', 'pickup'],
  stripe_publishable_key: null,
  pickup_delivery_note: null,
  tips: { enabled: false, presets: [15, 20, 25], allow_custom: true, show_no_tip: true },
  tax: { enabled: false, rate: 0, inclusive: false },
  orders_paused: false,
  pause_reason: null,
  menu_image_display: 'both',
  features: {
    menu_photos: false,
    item_modifiers: false,
    promotions_enabled: false,
    scheduled_orders_enabled: false,
    order_tracking_page: false,
    remove_powered_by: false,
    custom_brand_color: true,
  },
  scheduling: null,
  notices: [],
  media_base_url: 'http://localhost:8789/r2',
}

function menuWith(itemName: string): PublicMenuCategory[] {
  return [{
    id: 'cat-1',
    name: 'Mains',
    sort_order: 0,
    items: [{
      id: 'item-1',
      name: itemName,
      description: null,
      price: 9.99,
      availability_state: 'available',
      image_url: null,
      tags: [],
      has_variants: false,
      sort_order: 0,
      variants: [],
      modifier_groups: [],
      special_requests_enabled: true,
    }],
  }]
}

describe('STORY-074 · Widget scaffold & theme loading', () => {
  it('shadow DOM isolation: mountWidgetInShadow attaches a shadow root to the host', () => {
    const host = document.createElement('div')
    host.id = 'restroapi-widget'
    document.body.appendChild(host)

    const { container, shadow } = mountWidgetInShadow(host)

    expect(host.shadowRoot).not.toBeNull()
    expect(shadow).toBe(host.shadowRoot)
    expect(container.id).toBe('widget-root')
    expect(document.body.contains(container)).toBe(false)
    expect(shadow.contains(container)).toBe(true)

    document.body.removeChild(host)
  })

  it('CSS vars: injectCssVars sets all brand custom properties on host element', () => {
    const host = document.createElement('div')

    injectCssVars(host, SETTINGS)

    expect(host.style.getPropertyValue('--brand-primary')).toBe('#ff0000')
    expect(host.style.getPropertyValue('--brand-secondary')).toBe('#00ff00')
    expect(host.style.getPropertyValue('--brand-accent')).toBe('#0000ff')
    expect(host.style.getPropertyValue('--brand-text')).toBe('#111111')
    expect(host.style.getPropertyValue('--font-family')).toBe('Georgia, serif')
  })

  it('error state: shows error message and retry button when fetch fails', () => {
    renderWithQuery(<App state="error" settings={null} apiBase="http://localhost:8789" slug="acme" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Menu unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('loading state: shows skeleton placeholder', () => {
    renderWithQuery(<App state="loading" settings={null} apiBase="http://localhost:8789" slug="acme" />)
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })
})

describe('STORY-077 · Widget realtime storefront state', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    realtimeHandlers.clear()
    mockGetMenu.mockResolvedValue(menuWith('Original Burger'))
  })

  it('menu_availability_changed: menu is refetched and re-rendered', async () => {
    renderWithQuery(<App state="ready" settings={SETTINGS} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Original Burger')).toBeTruthy())

    mockGetMenu.mockResolvedValue(menuWith('Updated Burger'))
    fireRealtimeEvent('menu_availability_changed', {})

    await waitFor(() => expect(screen.getByText('Updated Burger')).toBeTruthy())
    expect(mockGetMenu).toHaveBeenCalledTimes(2)
  })

  it('pause_state_changed (paused): banner shown without a menu refetch', async () => {
    renderWithQuery(<App state="ready" settings={SETTINGS} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Original Burger')).toBeTruthy())
    expect(screen.queryByText('Orders are currently paused')).toBeNull()

    fireRealtimeEvent('pause_state_changed', { paused: true, mode: 'manual', reason: 'Kitchen closing early' })

    await waitFor(() => expect(screen.getByText('Orders are currently paused')).toBeTruthy())
    expect(screen.getByText('Kitchen closing early')).toBeTruthy()
    expect(mockGetMenu).toHaveBeenCalledTimes(1)
  })

  it('pause_state_changed (unpaused): banner clears', async () => {
    const pausedSettings: WidgetSettings = { ...SETTINGS, orders_paused: true, pause_reason: 'Busy' }
    renderWithQuery(<App state="ready" settings={pausedSettings} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Orders are currently paused')).toBeTruthy())

    fireRealtimeEvent('pause_state_changed', { paused: false })

    await waitFor(() => expect(screen.queryByText('Orders are currently paused')).toBeNull())
  })

  it('notice_created: qualifying notice appears without a page reload', async () => {
    renderWithQuery(<App state="ready" settings={SETTINGS} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Original Burger')).toBeTruthy())

    fireRealtimeEvent('notice_created', {
      id: 'notice-1',
      type: 'warning',
      message: 'Limited menu today',
      display_locations: ['storefront'],
      priority: 0,
      active: true,
    })

    await waitFor(() => expect(screen.getByText('Limited menu today')).toBeTruthy())
  })

  it('notice_created: non-qualifying notice (wrong location) is not shown', async () => {
    renderWithQuery(<App state="ready" settings={SETTINGS} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Original Burger')).toBeTruthy())

    fireRealtimeEvent('notice_created', {
      id: 'notice-2',
      type: 'warning',
      message: 'Checkout-only notice',
      display_locations: ['checkout'],
      priority: 0,
      active: true,
    })

    expect(screen.queryByText('Checkout-only notice')).toBeNull()
  })

  it('notice_removed: notice disappears', async () => {
    const withNotice: WidgetSettings = {
      ...SETTINGS,
      notices: [{ id: 'notice-1', type: 'informational', message: 'Heads up', display_locations: ['storefront'], priority: 0 }],
    }
    renderWithQuery(<App state="ready" settings={withNotice} apiBase="http://localhost:8789" slug="acme" />)
    await waitFor(() => expect(screen.getByText('Heads up')).toBeTruthy())

    fireRealtimeEvent('notice_removed', { id: 'notice-1' })

    await waitFor(() => expect(screen.queryByText('Heads up')).toBeNull())
  })
})
