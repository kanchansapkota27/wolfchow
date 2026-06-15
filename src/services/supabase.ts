import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'

/**
 * Anon client — uses the anon key and therefore respects RLS.
 * Use for user-scoped queries that must be constrained by the caller's row
 * level security policies.
 */
export function createAnonClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Admin client — uses the service role key and BYPASSES RLS.
 * Use only for cross-tenant superadmin queries and cron/internal operations.
 * Never expose this client's results across tenant boundaries without an
 * explicit, audited check.
 */
export function createAdminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
