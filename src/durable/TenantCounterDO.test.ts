import { describe, expect, it } from 'vitest'
import { TenantCounterDO } from './TenantCounterDO'

// ── In-memory DurableObjectState stub ────────────────────────────────────────

class MemoryStorage {
  private store = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value)
  }

  async delete(keys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keys)) {
      let count = 0
      for (const k of keys) if (this.store.delete(k)) count++
      return count
    }
    return this.store.delete(keys)
  }

  async list<T>(opts?: { prefix?: string }): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const [k, v] of this.store) {
      if (!opts?.prefix || k.startsWith(opts.prefix)) {
        result.set(k, v as T)
      }
    }
    return result
  }

  async transaction<T>(fn: (txn: MemoryStorage) => Promise<T>): Promise<T> {
    return fn(this)
  }
}

function makeDO(): TenantCounterDO {
  const storage = new MemoryStorage()
  const state = { storage } as unknown as DurableObjectState
  return new TenantCounterDO(state)
}

function post(do_: TenantCounterDO, path: string, body: unknown): Promise<Response> {
  return do_.fetch(
    new Request(`https://do${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

function get(do_: TenantCounterDO, path: string): Promise<Response> {
  return do_.fetch(new Request(`https://do${path}`))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('STORY-NEW-G · TenantCounterDO', () => {
  it('increment below limit: returns 200 with new count', async () => {
    const do_ = makeDO()
    const res = await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 10 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(1)
  })

  it('read unknown counter: returns 0', async () => {
    const do_ = makeDO()
    const res = await get(do_, '/read?counter=smtp&period=2026-07')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(0)
  })

  it('read after increments: returns current count', async () => {
    const do_ = makeDO()
    await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    const res = await get(do_, '/read?counter=smtp&period=2026-07')
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(3)
  })

  it('101st increment with limit 100: 429, count stays at 100', async () => {
    const do_ = makeDO()
    // Fill to 100
    for (let i = 0; i < 100; i++) {
      const r = await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
      expect(r.status).toBe(200)
    }
    // 101st should be denied
    const res = await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    expect(res.status).toBe(429)
    const body = (await res.json()) as { count: number; limit: number }
    expect(body.count).toBe(100)
    expect(body.limit).toBe(100)
    // Confirm counter did NOT increment
    const read = await get(do_, '/read?counter=smtp&period=2026-07')
    const readBody = (await read.json()) as { count: number }
    expect(readBody.count).toBe(100)
  })

  it('month rollover: new period starts at 0', async () => {
    const do_ = makeDO()
    await post(do_, '/increment', { counter: 'smtp', period: '2026-06', limit: 100 })
    await post(do_, '/increment', { counter: 'smtp', period: '2026-06', limit: 100 })
    // July is a fresh period
    const res = await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(1)
  })

  it('separate counter names are independent', async () => {
    const do_ = makeDO()
    await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 1 })
    // smtp exhausted — webhook counter is independent
    const res = await post(do_, '/increment', { counter: 'webhook', period: '2026-07', limit: 100 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(1)
  })

  it('reset deletes the counter entry', async () => {
    const do_ = makeDO()
    await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
    await post(do_, '/reset', { counter: 'smtp', period: '2026-07' })
    const res = await get(do_, '/read?counter=smtp&period=2026-07')
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(0)
  })

  it('100 sequential increments with limit 100: final count 100, all 200', async () => {
    const do_ = makeDO()
    const results: number[] = []
    for (let i = 0; i < 100; i++) {
      const r = await post(do_, '/increment', { counter: 'smtp', period: '2026-07', limit: 100 })
      expect(r.status).toBe(200)
      const b = (await r.json()) as { count: number }
      results.push(b.count)
    }
    expect(results[results.length - 1]).toBe(100)
    const read = await get(do_, '/read?counter=smtp&period=2026-07')
    const readBody = (await read.json()) as { count: number }
    expect(readBody.count).toBe(100)
  })

  it('missing counter field: 400', async () => {
    const do_ = makeDO()
    const res = await post(do_, '/increment', { period: '2026-07', limit: 10 })
    expect(res.status).toBe(400)
  })

  it('missing period field: 400', async () => {
    const do_ = makeDO()
    const res = await post(do_, '/increment', { counter: 'smtp', limit: 10 })
    expect(res.status).toBe(400)
  })

  it('GET /read missing params: 400', async () => {
    const do_ = makeDO()
    const res = await get(do_, '/read?counter=smtp')
    expect(res.status).toBe(400)
  })

  it('unknown path: 404', async () => {
    const do_ = makeDO()
    const res = await get(do_, '/unknown')
    expect(res.status).toBe(404)
  })
})
