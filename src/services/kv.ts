/**
 * Typed KV cache with stale-while-revalidate.
 *
 * Wraps a single injected `KVNamespace` so the cache is testable with a fake
 * namespace and so route handlers never call `c.env.KV.get()` directly. All keys
 * follow a strict naming convention (see {@link KvKeyType} and {@link KV_TTLS});
 * `buildKey` is the only sanctioned way to construct them.
 *
 * `getOrFetch` returns the cached value immediately and refreshes it in the
 * background via `ctx.waitUntil`, so a stale hit never delays the response.
 */

/** Cacheable resource kinds. All but `slug` are keyed by `restaurant_id`. */
export type KvKeyType = 'menu' | 'settings' | 'flags' | 'hours' | 'promos' | 'plan' | 'theme' | 'slug'

/**
 * Per-type TTL in seconds. `slug` maps a slug → restaurant_id and never changes,
 * so it is cached forever (no `expirationTtl` passed to KV).
 */
export const KV_TTLS: Record<KvKeyType, number | null> = {
  menu: 300,
  settings: 60,
  flags: 60,
  hours: 300,
  promos: 120,
  plan: 3600,
  theme: 600,
  slug: null,
}

/** Resource types scoped to a restaurant — everything `invalidateAll` clears. */
export const RESTAURANT_SCOPED_TYPES: ReadonlyArray<Exclude<KvKeyType, 'slug'>> = [
  'menu',
  'settings',
  'flags',
  'hours',
  'promos',
  'plan',
  'theme',
]

/** Build a canonical KV key: `{type}:{id}` where id is a restaurant_id (or slug). */
export function buildKey(type: KvKeyType, id: string): string {
  return `${type}:${id}`
}

export class KvCache {
  constructor(private readonly kv: KVNamespace) {}

  /** Read and JSON-parse a value, or null when the key is absent. */
  async get<T>(key: string): Promise<T | null> {
    return this.kv.get<T>(key, 'json')
  }

  /** JSON-serialise and store a value. `ttlSeconds <= 0` stores without expiry. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const options = ttlSeconds > 0 ? { expirationTtl: ttlSeconds } : undefined
    await this.kv.put(key, JSON.stringify(value), options)
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key)
  }

  /** Invalidate one resource type for a restaurant. */
  async invalidate(restaurantId: string, type: KvKeyType): Promise<void> {
    await this.delete(buildKey(type, restaurantId))
  }

  /** Invalidate every restaurant-scoped resource type in parallel. */
  async invalidateAll(restaurantId: string): Promise<void> {
    await Promise.all(
      RESTAURANT_SCOPED_TYPES.map((type) => this.delete(buildKey(type, restaurantId))),
    )
  }

  /**
   * Return the cached value immediately when present, refreshing it in the
   * background (`ctx.waitUntil`) so the response is never blocked by the write.
   * On a miss, fetch synchronously, cache the result, and return it.
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    ctx: ExecutionContext,
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      ctx.waitUntil(this.revalidate(key, fetcher, ttl))
      return cached
    }
    const fresh = await fetcher()
    await this.set(key, fresh, ttl)
    return fresh
  }

  private async revalidate<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<void> {
    const fresh = await fetcher()
    await this.set(key, fresh, ttl)
  }
}
