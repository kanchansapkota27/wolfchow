import { describe, expect, it } from 'vitest'
import { getNextOrderNumber } from './orderNumber'
import type { Env } from '../types'

function fakeTenantCounter() {
  const calls: Array<{ body: unknown; path: string }> = []
  let nextCount = 1
  return {
    calls,
    namespace: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async (url: string | URL, init?: RequestInit) => {
          const body = init?.body ? JSON.parse(init.body as string) : null
          calls.push({ body, path: new URL(url).pathname })
          const count = nextCount++
          return new Response(JSON.stringify({ count }), { status: 200 })
        },
      }),
    },
  }
}

function makeEnv(namespace: unknown): Env {
  return { TENANT_COUNTER: namespace } as unknown as Env
}

describe('getNextOrderNumber', () => {
  it('increments the order_number counter keyed by restaurant local date', async () => {
    const fake = fakeTenantCounter()
    const env = makeEnv(fake.namespace)

    // 2026-07-22T23:30:00Z is still 2026-07-22 in America/New_York (UTC-4 in July).
    const now = new Date('2026-07-22T23:30:00Z')
    const n = await getNextOrderNumber(env, 'rest-1', 'America/New_York', now)

    expect(n).toBe(1)
    expect(fake.calls[0]?.path).toBe('/increment')
    expect(fake.calls[0]?.body).toMatchObject({ counter: 'order_number', period: '2026-07-22' })
  })

  it('uses the restaurant timezone, not UTC, for the day boundary', async () => {
    const fake = fakeTenantCounter()
    const env = makeEnv(fake.namespace)

    // 2026-07-23T02:00:00Z is still 2026-07-22 evening in America/Los_Angeles (UTC-7),
    // but already 2026-07-23 in UTC — proves the period key follows local time.
    const now = new Date('2026-07-23T02:00:00Z')
    await getNextOrderNumber(env, 'rest-1', 'America/Los_Angeles', now)

    expect(fake.calls[0]?.body).toMatchObject({ period: '2026-07-22' })
  })

  it('successive calls for the same restaurant/day increment sequentially', async () => {
    const fake = fakeTenantCounter()
    const env = makeEnv(fake.namespace)
    const now = new Date('2026-07-22T18:00:00Z')

    const first = await getNextOrderNumber(env, 'rest-1', 'UTC', now)
    const second = await getNextOrderNumber(env, 'rest-1', 'UTC', now)

    expect(first).toBe(1)
    expect(second).toBe(2)
  })

  it('passes an effectively unbounded limit so order numbers are never capped', async () => {
    const fake = fakeTenantCounter()
    const env = makeEnv(fake.namespace)
    await getNextOrderNumber(env, 'rest-1', 'UTC', new Date('2026-07-22T18:00:00Z'))

    expect(fake.calls[0]?.body).toMatchObject({ limit: Number.MAX_SAFE_INTEGER })
  })
})
