-- STORY-NEW-A · Supabase custom access token hook
--
-- Injects role / restaurant_id / permissions from public.users into the JWT
-- claims on every sign-in, so the Worker's jwtMiddleware (STORY-003) can trust
-- them without a DB lookup. Registered in supabase/config.toml under
-- [auth.hook.custom_access_token].
--
-- DEVIATION FROM SPEC: the spec reads `event->>'userId'`, but Supabase's auth
-- hook event uses snake_case `user_id`. Using the correct key here.
-- A not-found or deactivated user returns the event unchanged (no custom
-- claims injected) — the user still gets a base token, but the Worker guards
-- will reject it (no role).

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  user_record RECORD;
  claims jsonb;
BEGIN
  SELECT role, restaurant_id, permissions, active
  INTO user_record
  FROM public.users
  WHERE id = (event->>'user_id')::uuid;

  IF NOT FOUND OR NOT user_record.active THEN
    RETURN event;
  END IF;

  claims := COALESCE(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{role}', to_jsonb(user_record.role));
  -- restaurant_id is nullable (superadmin/support). to_jsonb(NULL) is SQL NULL,
  -- and jsonb_set() with a NULL value returns NULL for the whole expression —
  -- which would drop all custom claims. Coalesce to a JSON `null` literal.
  claims := jsonb_set(claims, '{restaurant_id}', COALESCE(to_jsonb(user_record.restaurant_id), 'null'::jsonb));
  claims := jsonb_set(claims, '{permissions}', COALESCE(to_jsonb(user_record.permissions), '[]'::jsonb));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- The auth server (supabase_auth_admin) is the only role allowed to run the hook.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
