import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { WidgetSettings } from './types'
import { App } from './App'
import { injectCssVars, mountWidgetInShadow } from './bootstrap'

const SETTINGS: WidgetSettings = {
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
    render(<App state="error" settings={null} apiBase="http://localhost:8789" slug="acme" />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Menu unavailable')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('loading state: shows skeleton placeholder', () => {
    render(<App state="loading" settings={null} apiBase="http://localhost:8789" slug="acme" />)
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })
})
