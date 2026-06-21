import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../../types'
import { registerTabletRoutes } from './index'
import { signJwt } from '../../services/tokens'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn()

vi.mock('../../services/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom }),
  createAnonClient: () => ({}),
}))

const mockBroadcast = vi.fn()

const app = new Hono<HonoEnv>()
registerTabletRoutes(app, { broadcaster: { broadcast: mockBroadcast } })

const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'
const RESTAURANT_ID = '550e8400-e29b-41d4-a716-446655440001'

const env = {
  SUPABASE_URL: 'http://unused',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  MENU_CACHE: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
  DEVICE_TOKENS: { get: vi.fn() },
  MASTER_ENCRYPTION_KEY: btoa('a'.repeat(32)),
} as unknown as Env

async function makeToken(permissions: string[] = []) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    { sub: 'user-1', role: 'kitchen', restaurant_id: RESTAURANT_ID, permissions, device_id: null, imp: false, imp_by: null, amr: [], aud: 'authenticated', iat: now, exp: now + 3600 },
    JWT_SECRET,
  )
}

function chainStatus(currentStatus: string) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn()
      .mockResolvedValueOnce({ data: { id: 'order-1', status: currentStatus, restaurant_id: RESTAURANT_ID }, error: null })
      .mockResolvedValueOnce({ data: { id: 'order-1', status: 'next', items: [] }, error: null }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-032 · Order status updates', () => {
  it('accepted → preparing: 200, broadcast fired', async () => {
    mockFrom.mockReturnValue(chainStatus('accepted'))
    const token = await makeToken(['orders:status'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preparing' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(mockBroadcast).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'order_status_changed',
      { order_id: 'order-1', previous_status: 'accepted', new_status: 'preparing' },
      expect.anything(),
    )
  })

  it('preparing → ready: 200', async () => {
    mockFrom.mockReturnValue(chainStatus('preparing'))
    const token = await makeToken(['orders:status'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
  })

  it('ready → completed: 200', async () => {
    mockFrom.mockReturnValue(chainStatus('ready'))
    const token = await makeToken(['orders:status'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
  })

  it('preparing → accepted: 422 with allowed transitions', async () => {
    mockFrom.mockReturnValue(chainStatus('preparing'))
    const token = await makeToken(['orders:status'])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted' }),
      }),
      env,
    )
    expect(res.status).toBe(422)
    const body = await res.json() as { error: string; allowed: string[] }
    expect(body.error).toBe('invalid_transition')
    expect(body.allowed).toEqual(['ready'])
  })

  it('without orders:status permission: 403', async () => {
    const token = await makeToken([])
    const res = await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preparing' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('broadcast payload: correct order_id and statuses', async () => {
    mockFrom.mockReturnValue(chainStatus('accepted'))
    const token = await makeToken(['orders:status'])
    await app.fetch(
      new Request('http://localhost/tablet/orders/order-1/status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preparing' }),
      }),
      env,
    )
    const [, , payload] = mockBroadcast.mock.calls[0] as [string, string, { order_id: string; previous_status: string; new_status: string }]
    expect(payload.order_id).toBe('order-1')
    expect(payload.previous_status).toBe('accepted')
    expect(payload.new_status).toBe('preparing')
  })
})
