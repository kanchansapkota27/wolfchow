-- STORY-056 · Invite restaurant name + direct restaurant creation
--
-- 1. Add optional restaurant_name to invites so superadmin can pre-fill the
--    name the new tenant will see on their account during signup.
-- 2. No other schema changes needed — the restaurants table already has all
--    required columns; direct creation goes through the service-role client
--    which bypasses RLS.

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS restaurant_name text;

COMMENT ON COLUMN invites.restaurant_name IS
  'Optional business name pre-filled by superadmin; shown during restaurant signup.';
