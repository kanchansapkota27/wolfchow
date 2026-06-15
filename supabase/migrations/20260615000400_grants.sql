-- STORY-002 · Privilege grants
--
-- RLS (migration 019) governs WHICH ROWS each tenant can see; these GRANTs
-- govern table-level access. Supabase's PostgREST switches to the anon /
-- authenticated / service_role Postgres role per request, and those roles need
-- explicit privileges on tables created by migrations.
--
-- Posture:
--   * service_role  — trusted server-side role (bypasses RLS): full access to all.
--   * authenticated — CRUD on non-secret tenant tables; rows confined by RLS.
--   * secret-bearing / platform tables (smtp_config, payment_config,
--     webhook_config, webhook_deliveries, audit_log, email_log, plans, invites)
--     are intentionally service_role-only — the Worker reaches them via the
--     service-role client, never the user-scoped client.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Trusted server role: full access to every table (RLS bypassed).
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Authenticated tenant users: CRUD on non-secret tenant tables (RLS-confined).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  restaurants,
  users,
  menu_categories,
  menu_items,
  item_variants,
  modifier_groups,
  modifier_options,
  orders,
  order_items,
  operating_hours,
  special_closures,
  promotions,
  notices,
  notification_config
TO authenticated;
