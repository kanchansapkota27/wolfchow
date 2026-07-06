import type { SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'
import { createAdminClient } from './supabase'
import { StripeService } from './stripe'

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
    if (error || !data) throw new Error(`vault.put failed: ${error?.message ?? 'no id returned'}`)
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
    if (error) throw new Error(`vault.rotate failed: ${error.message}`)
  }

  /**
   * Retrieve the decrypted plaintext for a vault secret uuid.
   * Reads vault.decrypted_secrets through the vault schema client.
   */
  async get(vaultId: string): Promise<string> {
    const { data, error } = await this.client
      .schema('vault')
      .from('decrypted_secrets')
      .select('decrypted_secret')
      .eq('id', vaultId)
      .single()

    if (error || !data) throw new Error(`vault.get failed: ${error?.message ?? 'not found'}`)
    const row = data as { decrypted_secret: string | null }
    if (row.decrypted_secret === null) throw new Error('vault.get: secret is null')
    return row.decrypted_secret
  }

  /** Delete a secret from Vault (called when the referencing row is deleted). */
  async delete(vaultId: string): Promise<void> {
    const { error } = await this.client
      .schema('vault')
      .from('secrets')
      .delete()
      .eq('id', vaultId)
    if (error) throw new Error(`vault.delete failed: ${error.message}`)
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
