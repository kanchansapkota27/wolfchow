import { describe, it, expect } from 'vitest'
import app from '../index'

describe('STORY-001 · project setup / health', () => {
  it('GET /health returns 200', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; timestamp: string }
    expect(body.status).toBe('ok')
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('GET /health is fast', async () => {
    const start = Date.now()
    await app.request('/health')
    expect(Date.now() - start).toBeLessThan(100)
  })
})
