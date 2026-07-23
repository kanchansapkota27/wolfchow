import type { Env } from '../types'

// Effectively unbounded — TenantCounterDO's /increment requires a limit, but
// order numbers should never be capped. No real restaurant approaches this
// many orders in a single day.
const NO_PRACTICAL_LIMIT = Number.MAX_SAFE_INTEGER

/**
 * `YYYY-MM-DD` in the restaurant's own timezone (not UTC), so the daily
 * sequence resets at the restaurant's local midnight rather than a fixed
 * clock time that could roll over mid-dinner-rush for some tenants.
 * `en-CA` is a well-known trick for getting `Intl.DateTimeFormat` to emit
 * ISO-ordered `YYYY-MM-DD` directly.
 */
function localDateKey(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/**
 * Atomically assigns the next human-readable order number for a restaurant's
 * current local day, via TenantCounterDO (one DO instance per restaurant;
 * all requests to it are serialised, so no race between concurrent orders).
 * Counter key is `order_number:<local-date>`, distinct from the `smtp:<YYYY-MM>`
 * counter already stored on the same DO instance.
 */
export async function getNextOrderNumber(env: Env, restaurantId: string, timezone: string, now = new Date()): Promise<number> {
  const period = localDateKey(timezone, now)
  const stub = env.TENANT_COUNTER.get(env.TENANT_COUNTER.idFromName(restaurantId))
  const res = await stub.fetch('https://do/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ counter: 'order_number', period, limit: NO_PRACTICAL_LIMIT }),
  })
  const body = (await res.json()) as { count: number }
  return body.count
}
