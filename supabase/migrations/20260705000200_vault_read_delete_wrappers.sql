-- Public-schema wrappers for reading, deleting, and looking-up Vault secrets.
-- SecretsService uses these RPCs so the vault schema never needs to be
-- exposed in PostgREST (vault.* stays private).

CREATE OR REPLACE FUNCTION public.vault_get_secret(p_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.vault_delete_secret(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  DELETE FROM vault.secrets WHERE id = p_id;
$$;

-- Returns the uuid of an existing secret by name, or NULL if not found.
-- Used by routes to handle the "vault entry exists but referencing row was
-- deleted" case — allows rotate-instead-of-create without a second DB round-trip.
CREATE OR REPLACE FUNCTION public.vault_find_secret_id(p_name text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT id FROM vault.secrets WHERE name = p_name LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_get_secret(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vault_find_secret_id(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.vault_get_secret(uuid)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.vault_delete_secret(uuid) TO service_role;
GRANT  EXECUTE ON FUNCTION public.vault_find_secret_id(text) TO service_role;
