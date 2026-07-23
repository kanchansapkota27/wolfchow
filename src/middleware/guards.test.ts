import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../types'
import { jwtMiddleware } from './jwt'
import { requireActiveRestaurant, requireRestaurant, requireRole } from './guards'
import { signJwt } from '../services/tokens'

const RESTAURANT_ID = 'rest-uuid-1'
const JWT_SECRET = 'test-secret-at-least-32-characters-long-xx'

async function ownerToken(restaurantId: string | null = RESTAURANT_ID) {
  const now = Math.floor(Date.now() / 1000)
  return signJwt(
    {
      sub: 'user-uuid-1',
      role: 'restaurant_owner',
      restaurant_id: restaurantId,
      permissions: [],
      device_id: null,
      imp: false,
      imp_by: null,
      amr: [],
      aud: 'authenticated',
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  )
}

const mockKv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const env = {
  SUPABASE_JWT_SECRET: JWT_SECRET,
  SETTINGS_CACHE: mockKv,
} as unknown as Env

function buildApp() {
  const app = new Hono<HonoEnv>()
  app.use('/protected/*', jwtMiddleware, requireRole('restaurant_owner'), requireRestaurant(), requireActiveRestaurant())
  app.get('/protected/ping', (c) => c.json({ ok: true }))
  return app
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('STORY-083 · requireActiveRestaurant guard', () => {
  it('suspended:{id} = true in KV: request rejected with 403', async () => {
    mockKv.get.mockResolvedValueOnce(true)
    const app = buildApp()
    const token = await ownerToken()

    const res = await app.request('/protected/ping', { headers: { Authorization: `Bearer ${token}` } }, env)

    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.code).toBe('restaurant_suspended')
    expect(mockKv.get).toHaveBeenCalledWith(`suspended:${RESTAURANT_ID}`, 'json')
  })

  it('suspended:{id} = false in KV: request allowed through', async () => {
    mockKv.get.mockResolvedValueOnce(false)
    const app = buildApp()
    const token = await ownerToken()

    const res = await app.request('/protected/ping', { headers: { Authorization: `Bearer ${token}` } }, env)

    expect(res.status).toBe(200)
  })

  it('no KV entry for this restaurant: fails open, request allowed through', async () => {
    mockKv.get.mockResolvedValueOnce(null)
    const app = buildApp()
    const token = await ownerToken()

    const res = await app.request('/protected/ping', { headers: { Authorization: `Bearer ${token}` } }, env)

    expect(res.status).toBe(200)
  })

  it('another restaurant is suspended: this restaurant unaffected', async () => {
    mockKv.get.mockImplementation(async (key: string) => (key === 'suspended:other-restaurant' ? true : null))
    const app = buildApp()
    const token = await ownerToken()

    const res = await app.request('/protected/ping', { headers: { Authorization: `Bearer ${token}` } }, env)

    expect(res.status).toBe(200)
  })
})
