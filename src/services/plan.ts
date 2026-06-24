import type { HonoEnv } from '../types'
import { createAdminClient } from './supabase'
import { buildKey, KvCache, KV_TTLS } from './kv'

/**
 * Return the plan record for a restaurant, with a DB fallback when the KV
 * entry is absent. This handles the gap between a superadmin plan change
 * (which only invalidates the KV key) and the next organic write (which
 * happens at signup). Without the fallback, all plan-gated routes would
 * treat the restaurant as planless and block features unnecessarily.
 */
export async function resolvePlan(
  env: HonoEnv['Bindings'],
  restaurantId: string,
): Promise<Record<string, unknown> | null> {
  const cache = new KvCache(env.SETTINGS_CACHE)
  const cached = await cache.get<Record<string, unknown>>(buildKey('plan', restaurantId))
  if (cached !== null) return cached

  const admin = createAdminClient(env)
  const { data } = await admin
    .from('restaurants')
    .select('plans(*)')
    .eq('id', restaurantId)
    .maybeSingle()

  const plan = (data as { plans?: Record<string, unknown> | null } | null)?.plans ?? null
  if (plan) {
    await cache.set(buildKey('plan', restaurantId), plan, KV_TTLS['plan'] ?? 3600)
  }
  return plan
}
