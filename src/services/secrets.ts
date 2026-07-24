import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { createAdminClient } from './supabase'
import { StripeService } from './stripe'

/**
 * Thrown for any Supabase Vault RPC failure. Callers that echo a caught
 * error's message back to the client (e.g. SMTP test / refund endpoints)
 * must check for this and substitute a generic message instead — the raw
 * message ("vault.get: secret is null", underlying Postgres error text,
 * etc.) is an internal implementation detail, not something a restaurant
 * admin's browser should ever see. Always log the original error server-side.
 */
export class VaultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

/**
 * Thin wrapper over Supabase Vault for per-tenant secrets.
 *
 * Secrets are encrypted by Supabase with keys held outside the database —
 * a DB dump or backup leak does not expose plaintext credentials. Reads
 * require the service-role key (only the Worker holds it); anon/authenticated
 * are revoked from vault.* in the grants migration.
 *
 * Naming convention:
 *   stripe:{restaurant_id}   — Stripe restricted key
 *   smtp:{restaurant_id}     — per-restaurant SMTP password
 *   smtp:global              — global SMTP password
 *
 * Callers store the returned uuid in a `*_vault_id` column and pass it back
 * to `get` / `rotate` / `delete`. Plaintext is never stored or logged.
 */
export class SecretsService {
  private readonly client: SupabaseClient

  constructor(env: Env, client?: SupabaseClient) {
    this.client = client ?? createAdminClient(env)
  }

  /**
   * Store a new secret in Vault; returns the uuid to persist in the DB.
   * Calls the public.vault_create_secret wrapper (SECURITY DEFINER, service-role only).
   */
  async put(name: string, plaintext: string): Promise<string> {
    const { data, error } = await this.client.rpc('vault_create_secret', {
      p_secret: plaintext,
      p_name: name,
    })
    if (error || !data) throw new VaultError(`vault.put failed: ${error?.message ?? 'no id returned'}`)
    return data as string
  }

  /**
   * Replace the plaintext of an existing secret (rotate).
   * Calls the public.vault_update_secret wrapper.
   */
  async rotate(vaultId: string, plaintext: string): Promise<void> {
    const { error } = await this.client.rpc('vault_update_secret', {
      p_id: vaultId,
      p_secret: plaintext,
    })
    if (error) throw new VaultError(`vault.rotate failed: ${error.message}`)
  }

  /**
   * Retrieve the decrypted plaintext for a vault secret uuid.
   * Reads vault.decrypted_secrets through the vault schema client.
   */
  async get(vaultId: string): Promise<string> {
    const { data, error } = await this.client.rpc('vault_get_secret', { p_id: vaultId })
    if (error) throw new VaultError(`vault.get failed: ${error.message}`)
    if (data === null || data === undefined) throw new VaultError('vault.get: secret is null')
    return data as string
  }

  /** Delete a secret from Vault (called when the referencing row is deleted). */
  async delete(vaultId: string): Promise<void> {
    const { error } = await this.client.rpc('vault_delete_secret', { p_id: vaultId })
    if (error) throw new VaultError(`vault.delete failed: ${error.message}`)
  }

  /**
   * Find the uuid of an existing secret by name, or null if not found.
   * Allows routes to rotate an orphaned vault entry (name still registered
   * but the referencing DB row was deleted) instead of failing with a
   * duplicate-name constraint error.
   */
  async findByName(name: string): Promise<string | null> {
    const { data, error } = await this.client.rpc('vault_find_secret_id', { p_name: name })
    if (error) throw new VaultError(`vault.findByName failed: ${error.message}`)
    return (data as string | null) ?? null
  }
}

/**
 * Build a configured StripeService for a restaurant by resolving
 * stripe_secret_vault_id from payment_config and decrypting via Vault.
 * Returns null if no Stripe key is configured for the restaurant.
 */
export async function getStripeClient(
  restaurantId: string,
  env: Env,
  secrets?: SecretsService,
): Promise<StripeService | null> {
  const admin = createAdminClient(env)
  const { data } = await admin
    .from('payment_config')
    .select('stripe_secret_vault_id')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  const row = data as { stripe_secret_vault_id: string | null } | null
  if (!row?.stripe_secret_vault_id) return null

  const svc = secrets ?? new SecretsService(env)
  const secretKey = await svc.get(row.stripe_secret_vault_id)
  return new StripeService(secretKey)
}
