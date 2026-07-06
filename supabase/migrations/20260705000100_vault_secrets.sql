-- STORY-042 · Supabase Vault secrets migration
--
-- Replaces AES-256-GCM encrypted columns with Vault uuid references.
-- Keys are held by Supabase outside the DB — a dump or backup leak
-- never exposes plaintext credentials.
--
-- Public-schema wrapper functions bridge PostgREST (which only exposes
-- public.*) to vault.* functions. SECURITY DEFINER + restricted GRANT
-- means only the service role can call them.

-- ── Vault wrapper functions (public schema) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.vault_create_secret(p_secret text, p_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT vault.create_secret(p_secret, p_name);
$$;

CREATE OR REPLACE FUNCTION public.vault_update_secret(p_id uuid, p_secret text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT vault.update_secret(p_id, p_secret);
$$;

-- Only the service role (used by the Worker) may call vault wrappers.
REVOKE EXECUTE ON FUNCTION public.vault_create_secret(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_update_secret(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_create_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vault_update_secret(uuid, text) TO service_role;

-- Anon and authenticated must not read decrypted secrets.
-- (belt-and-braces with the RLS grants migration)
REVOKE ALL ON vault.decrypted_secrets FROM anon, authenticated;
REVOKE ALL ON vault.secrets FROM anon, authenticated;

-- ── smtp_config: replace encrypted_password with Vault reference ─────────────

ALTER TABLE smtp_config
  DROP COLUMN IF EXISTS encrypted_password;

ALTER TABLE smtp_config
  ADD COLUMN password_vault_id uuid;

-- For local dev: existing rows without a vault id will fail to send until
-- re-configured. In production, run a data migration script to move
-- existing encrypted values to Vault before deploying.

-- ── payment_config: replace encrypted_stripe_secret with Vault reference ─────

ALTER TABLE payment_config
  DROP COLUMN IF EXISTS encrypted_stripe_secret;

ALTER TABLE payment_config
  ADD COLUMN stripe_secret_vault_id uuid;
