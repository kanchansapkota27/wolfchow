import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerPublicSettingsRoutes } from './settings'

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

const app = new Hono<HonoEnv>()
registerPublicSettingsRoutes(app)

const mockRateLimiter = { limit: vi.fn().mockResolvedValue({ success: true }) }
const mockKv = { get: vi.fn(), put: vi.fn(), delete: vi.fn() }

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  RATE_LIMITER_PUBLIC: mockRateLimiter,
  SETTINGS_CACHE: mockKv,
} as unknown as Env

const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440002'
const SLUG = 'the-burger-place'

function makeRestaurantRow() {
  return {
    id: RESTAURANT_ID,
    slug: SLUG,
    display_name: 'The Burger Place',
    logo_r2_key: null,
    brand_colors: null,
    currency: 'USD',
    timezone: 'America/New_York',
    plan_id: 'plan-1',
    tips_enabled: true,
    tip_presets: [10, 15, 20],
    allow_custom_tip: true,
    show_no_tip: true,
    tax_enabled: false,
    tax_rate: 0,
    tax_inclusive: false,
    orders_paused: false,
    pause_reason: null,
    base_prep_minutes: 20,
    scheduling_interval: 15,
  }
}

function chain(opts: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: opts.data ?? null, error: opts.error ?? null }
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: vi.fn((resolve: (v: typeof resolved) => unknown) => Promise.resolve(resolve(resolved))),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRateLimiter.limit.mockResolvedValue({ success: true })
  mockKv.get.mockResolvedValue(null)
  mockKv.put.mockResolvedValue(undefined)
})

describe('STORY-074 · Public widget settings', () => {
  it('GET /public/:slug/settings returns restaurant_id for realtime channel naming', async () => {
    mockFrom
      .mockReturnValueOnce(chain({ data: makeRestaurantRow() })) // restaurants
      .mockReturnValueOnce(chain({ data: { feature_flags: {}, payment_methods_allowed: null } })) // plans
      .mockReturnValueOnce(chain({ data: { stripe_publishable_key: null, payment_methods_enabled: ['pickup'], pickup_delivery_note: null } })) // payment_config
      .mockReturnValueOnce(chain({ data: [] })) // notices

    const res = await app.request(`/public/${SLUG}/settings`, {}, env)

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.restaurant_id).toBe(RESTAURANT_ID)
    expect(body.slug).toBe(SLUG)
  })

  it('GET /public/:slug/settings with unknown slug returns 404', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null }))

    const res = await app.request(`/public/${SLUG}/settings`, {}, env)
    expect(res.status).toBe(404)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('restaurant_not_found')
  })

  it('GET /public/:slug/settings rate limited returns 429', async () => {
    mockRateLimiter.limit.mockResolvedValue({ success: false })

    const res = await app.request(`/public/${SLUG}/settings`, {}, env)
    expect(res.status).toBe(429)
  })

  it('GET /public/:slug/settings invalid slug format returns 400', async () => {
    const res = await app.request('/public/AB/settings', {}, env)
    expect(res.status).toBe(400)
  })
})
