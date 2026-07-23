import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicMenuCategory } from '../types'
import type { WidgetSettings } from '../types'
import { Menu } from './Menu'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const SETTINGS: WidgetSettings = {
  restaurant_id: 'r1',
  slug: 'acme',
  display_name: 'Acme',
  logo_url: null,
  brand_colors: null,
  font_family: null,
  currency: 'USD',
  timezone: 'UTC',
  payment_methods: ['pickup'],
  stripe_publishable_key: null,
  pickup_delivery_note: null,
  tips: { enabled: false, presets: [], allow_custom: false, show_no_tip: true },
  tax: { enabled: false, rate: 0, inclusive: false },
  orders_paused: false,
  pause_reason: null,
  menu_image_display: 'both',
  features: {
    menu_photos: true,
    item_modifiers: false,
    promotions_enabled: false,
    scheduled_orders_enabled: false,
    order_tracking_page: false,
    remove_powered_by: false,
    custom_brand_color: false,
  },
  scheduling: null,
  notices: [],
  media_base_url: 'http://localhost/r2',
}

const CATEGORIES: PublicMenuCategory[] = [{
  id: 'cat-1',
  name: 'Mains',
  sort_order: 0,
  items: [{
    id: 'item-1',
    name: 'Burger',
    description: null,
    price: 9.99,
    availability_state: 'available',
    image_url: 'http://localhost/r2/burger.jpg',
    tags: [],
    has_variants: false,
    sort_order: 0,
    variants: [],
    modifier_groups: [],
    special_requests_enabled: true,
  }],
}]

const noop = () => undefined

describe('Menu image visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('scope "both": image shown on both mobile and desktop viewports', () => {
    mockMatchMedia(true) // mobile
    render(<Menu categories={CATEGORIES} settings={SETTINGS} cartCount={0} cartTotal={0} onSelectItem={noop} onViewCart={noop} onAddSimpleItem={noop} />)
    expect(screen.getByAltText('Burger')).toBeInTheDocument()
  })

  it('scope "off": image hidden even though the item has one', () => {
    mockMatchMedia(false)
    render(
      <Menu
        categories={CATEGORIES}
        settings={{ ...SETTINGS, menu_image_display: 'off' }}
        cartCount={0}
        cartTotal={0}
        onSelectItem={noop}
        onViewCart={noop}
        onAddSimpleItem={noop}
      />,
    )
    expect(screen.queryByAltText('Burger')).not.toBeInTheDocument()
  })

  it('scope "mobile" on a desktop viewport: image hidden', () => {
    mockMatchMedia(false) // not mobile
    render(
      <Menu
        categories={CATEGORIES}
        settings={{ ...SETTINGS, menu_image_display: 'mobile' }}
        cartCount={0}
        cartTotal={0}
        onSelectItem={noop}
        onViewCart={noop}
        onAddSimpleItem={noop}
      />,
    )
    expect(screen.queryByAltText('Burger')).not.toBeInTheDocument()
  })

  it('plan flag off: image hidden regardless of scope', () => {
    mockMatchMedia(true)
    render(
      <Menu
        categories={CATEGORIES}
        settings={{ ...SETTINGS, menu_image_display: 'both', features: { ...SETTINGS.features, menu_photos: false } }}
        cartCount={0}
        cartTotal={0}
        onSelectItem={noop}
        onViewCart={noop}
        onAddSimpleItem={noop}
      />,
    )
    expect(screen.queryByAltText('Burger')).not.toBeInTheDocument()
  })
})
