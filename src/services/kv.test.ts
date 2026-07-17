import { describe, expect, it } from 'vitest'
import { KvCache, RESTAURANT_SCOPED_TYPES, buildKey } from './kv'

/**
 * In-memory stand-in for a CF KVNamespace. Records `put`/`delete` calls and
 * supports `get(key, 'json')`, which is all KvCache exercises.
 */
function makeKv() {
  const store = new Map<string, string>()
  const deletes: string[] = []
  const puts: string[] = []
  const ns = {
    get: async (key: string) => {
      const raw = store.get(key)
      return raw === undefined ? null : (JSON.parse(raw) as unknown)
    },
    put: async (key: string, value: string) => {
      store.set(key, value)
      puts.push(key)
    },
    delete: async (key: string) => {
      store.delete(key)
      deletes.push(key)
    },
  }
  return { store, deletes, puts, ns: ns as unknown as KVNamespace }
}

/** ExecutionContext whose waitUntil collects promises so tests can await them. */
function makeCtx() {
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
  }
  return { pending, ctx: ctx as unknown as ExecutionContext }
}

describe('STORY-040 · KV cache service', () => {
  it('get: returns typed value', async () => {
    const kv = makeKv()
    kv.store.set('menu:r1', JSON.stringify({ items: 3 }))
    const cache = new KvCache(kv.ns)
    const value = await cache.get<{ items: number }>('menu:r1')
    expect(value?.items).toBe(3)
  })

  it('get missing key: returns null', async () => {
    const cache = new KvCache(makeKv().ns)
    expect(await cache.get('menu:absent')).toBeNull()
  })

  it('set then get: value retrievable', async () => {
    const cache = new KvCache(makeKv().ns)
    await cache.set('settings:r1', { open: true }, 60)
    expect(await cache.get<{ open: boolean }>('settings:r1')).toEqual({ open: true })
  })

  it('invalidate menu: menu:{id} deleted', async () => {
    const kv = makeKv()
    kv.store.set('menu:r1', JSON.stringify({ items: 1 }))
    const cache = new KvCache(kv.ns)
    await cache.invalidate('r1', 'menu')
    expect(kv.deletes).toEqual([buildKey('menu', 'r1')])
    expect(await cache.get('menu:r1')).toBeNull()
  })

  it('invalidateAll: every restaurant-scoped key type deleted', async () => {
    const kv = makeKv()
    const cache = new KvCache(kv.ns)
    await cache.invalidateAll('r1')
    expect(kv.deletes.sort()).toEqual(
      RESTAURANT_SCOPED_TYPES.map((t) => buildKey(t, 'r1')).sort(),
    )
    expect(kv.deletes).toHaveLength(RESTAURANT_SCOPED_TYPES.length)
  })

  it('getOrFetch: stale value returned, background revalidation fired', async () => {
    const kv = makeKv()
    kv.store.set('menu:r1', JSON.stringify({ items: 'stale' }))
    const cache = new KvCache(kv.ns)
    const { pending, ctx } = makeCtx()

    let fetched = false
    const value = await cache.getOrFetch(
      'menu:r1',
      async () => {
        fetched = true
        return { items: 'fresh' }
      },
      300,
      ctx,
    )

    // Stale value returned synchronously, fetcher not yet awaited.
    expect(value).toEqual({ items: 'stale' })
    expect(pending).toHaveLength(1)

    // Background revalidation refreshes the cache.
    await Promise.all(pending)
    expect(fetched).toBe(true)
    expect(await cache.get('menu:r1')).toEqual({ items: 'fresh' })
  })

  it('getOrFetch miss: fetches synchronously and caches', async () => {
    const cache = new KvCache(makeKv().ns)
    const { pending, ctx } = makeCtx()
    const value = await cache.getOrFetch('menu:r2', async () => ({ items: 'new' }), 300, ctx)
    expect(value).toEqual({ items: 'new' })
    expect(pending).toHaveLength(0) // no background work on a miss
    expect(await cache.get('menu:r2')).toEqual({ items: 'new' })
  })
})
