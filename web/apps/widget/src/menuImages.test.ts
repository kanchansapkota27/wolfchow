import { describe, expect, it } from 'vitest'
import { shouldShowMenuImages } from './menuImages'
import type { WidgetSettings } from './types'

function settingsWith(overrides: { menu_photos?: boolean; menu_image_display?: WidgetSettings['menu_image_display'] }): WidgetSettings {
  return {
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
    menu_image_display: overrides.menu_image_display ?? 'both',
    features: {
      menu_photos: overrides.menu_photos ?? true,
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
}

describe('shouldShowMenuImages', () => {
  it('plan flag off: never shows images regardless of scope', () => {
    expect(shouldShowMenuImages(settingsWith({ menu_photos: false, menu_image_display: 'both' }), false)).toBe(false)
    expect(shouldShowMenuImages(settingsWith({ menu_photos: false, menu_image_display: 'both' }), true)).toBe(false)
  })

  it('scope "off": never shows images even when the plan allows it', () => {
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'off' }), false)).toBe(false)
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'off' }), true)).toBe(false)
  })

  it('scope "both": shows on mobile and desktop', () => {
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'both' }), false)).toBe(true)
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'both' }), true)).toBe(true)
  })

  it('scope "mobile": shows only on mobile', () => {
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'mobile' }), true)).toBe(true)
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'mobile' }), false)).toBe(false)
  })

  it('scope "desktop": shows only on desktop', () => {
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'desktop' }), false)).toBe(true)
    expect(shouldShowMenuImages(settingsWith({ menu_image_display: 'desktop' }), true)).toBe(false)
  })
})
