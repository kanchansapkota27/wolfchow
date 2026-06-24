-- Grant service_role access to platform_settings.
-- GRANT ALL ON ALL TABLES only covers tables that existed when it ran;
-- tables added in later migrations need explicit grants.
GRANT ALL ON public.platform_settings TO service_role;

-- Also fix audit_log.ip_address column: the table already has service_role
-- access but ALTER TABLE ADD COLUMN doesn't change existing grants, so no
-- additional action is needed there.

-- Prevent the same problem for future tables: set default privileges so any
-- table created by the migration role in this schema is automatically accessible
-- to service_role and authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
