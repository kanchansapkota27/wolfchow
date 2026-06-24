-- The users table id was a FK to auth.users(id) with no DEFAULT, which broke
-- two flows:
--   1. Device/tablet accounts have no auth.users entry at all.
--   2. Staff invite inserts didn't pass the auth user's id, so PK was null.
--
-- Fix: drop the FK constraint and add gen_random_uuid() as the default.
-- Human staff rows are still linked to auth by storing the auth user id
-- explicitly in the insert (handled in app code); device rows get a fresh UUID.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_id_fkey,
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
