import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { CreateOrderResult, WidgetSettings } from '../types'
import { Success } from './Success'

const SETTINGS: WidgetSettings = {
  restaurant_id: 'rest-1',
  slug: 'acme',
  display_name: 'Acme Burgers',
  logo_url: null,
  font_family: 'Georgia, serif',
  brand_colors: { primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff', text: '#111111' },
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
    order_tracking_page: true,
    remove_powered_by: false,
    custom_brand_color: true,
  },
  scheduling: null,
  notices: [],
  media_base_url: 'http://localhost:8789/r2',
}

const ORDER_RESULT: CreateOrderResult = {
  order_id: 'order-1',
  tracking_token: 'tok-1',
  order_number: 101,
  created_at: '2026-07-22T14:00:00.000Z',
  client_secret: null,
  total: 24,
  currency: 'USD',
  items: [
    {
      item_name: 'Burger',
      variant_name: 'Large',
      quantity: 2,
      unit_price: 10,
      modifiers: [{ name: 'Extra cheese', price_delta: 1 }],
      notes: 'No onions',
    },
  ],
  subtotal: 20,
  promo_discount: 0,
  tax_amount: 2,
  tax_inclusive: false,
  tip_amount: 2,
}

describe('Success', () => {
  it('renders the itemized receipt: item, quantity, modifiers, notes, and cost breakdown', () => {
    render(
      <Success orderResult={ORDER_RESULT} settings={SETTINGS} onTrackOrder={vi.fn()} onNewOrder={vi.fn()} />,
    )

    expect(screen.getByText(/2× Burger \(Large\)/)).toBeInTheDocument()
    expect(screen.getByText('+ Extra cheese')).toBeInTheDocument()
    expect(screen.getByText('"No onions"')).toBeInTheDocument()
    expect(screen.getAllByText('$20.00')).toHaveLength(2) // line-item cost + subtotal
    expect(screen.getAllByText('$2.00')).toHaveLength(2) // tax + tip
    expect(screen.getByText('$24.00')).toBeInTheDocument() // total
    expect(screen.getByText('Order #101 · Jul 22')).toBeInTheDocument()
  })

  it('hides the discount row when promo_discount is 0', () => {
    render(
      <Success orderResult={ORDER_RESULT} settings={SETTINGS} onTrackOrder={vi.fn()} onNewOrder={vi.fn()} />,
    )
    expect(screen.queryByText('Discount')).not.toBeInTheDocument()
  })

  it('shows the discount row when promo_discount is present', () => {
    render(
      <Success
        orderResult={{ ...ORDER_RESULT, promo_discount: 5 }}
        settings={SETTINGS}
        onTrackOrder={vi.fn()}
        onNewOrder={vi.fn()}
      />,
    )
    expect(screen.getByText('Discount')).toBeInTheDocument()
    expect(screen.getByText('−$5.00')).toBeInTheDocument()
  })

  it('respects the order_tracking_page feature flag: Track My Order hidden when off', () => {
    render(
      <Success
        orderResult={ORDER_RESULT}
        settings={{ ...SETTINGS, features: { ...SETTINGS.features, order_tracking_page: false } }}
        onTrackOrder={vi.fn()}
        onNewOrder={vi.fn()}
      />,
    )
    expect(screen.queryByText('Track My Order')).not.toBeInTheDocument()
  })
})
