import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PublicSettings } from '@wolfchow/api-client'
import { App } from './App'
import { injectCssVars, mountWidgetInShadow } from './bootstrap'

const SETTINGS: PublicSettings = {
  slug: 'acme',
  display_name: 'Acme Burgers',
  brand_colors: {
    primary: '#ff0000',
    secondary: '#00ff00',
    accent: '#0000ff',
    text: '#111111',
  },
  font_family: 'Georgia, serif',
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
    // Container lives inside shadow root, not in document body
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

  it('error state: shows "Menu temporarily unavailable" when fetch fails', () => {
    render(<App state="error" settings={null} />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Menu temporarily unavailable')).toBeTruthy()
  })

  it('loading state: shows skeleton placeholder with aria-busy', () => {
    render(<App state="loading" settings={null} />)
    const busy = screen.getByLabelText('Loading menu')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByTestId('skeleton')).toBeTruthy()
  })
})
