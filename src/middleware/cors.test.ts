import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Env, HonoEnv } from '../types'
import { corsMiddleware } from './cors'

const app = new Hono<HonoEnv>()
app.use('*', corsMiddleware())
app.get('/ping', (c) => c.json({ ok: true }))

const env = {} as unknown as Env // unset CORS_ALLOWED_ORIGINS → local dev defaults
const envProd = { CORS_ALLOWED_ORIGINS: 'https://superadmin.example.com' } as unknown as Env

describe('DEV · CORS middleware', () => {
  it('echoes an allowed local dev origin', async () => {
    const res = await app.request('/ping', { headers: { Origin: 'http://localhost:5173' } }, env)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
  })

  it('does not echo a disallowed origin', async () => {
    const res = await app.request('/ping', { headers: { Origin: 'http://evil.example' } }, env)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('handles a preflight OPTIONS for an allowed origin', async () => {
    const res = await app.request(
      '/ping',
      {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      },
      env,
    )
    expect([200, 204]).toContain(res.status)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('uses configured origins when CORS_ALLOWED_ORIGINS is set', async () => {
    const ok = await app.request('/ping', { headers: { Origin: 'https://superadmin.example.com' } }, envProd)
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://superadmin.example.com')

    const blocked = await app.request('/ping', { headers: { Origin: 'http://localhost:5173' } }, envProd)
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
