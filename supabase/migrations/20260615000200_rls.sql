-- STORY-002 · Row Level Security (spec migration 019)
--
-- Every tenant table gets RLS enabled + a `tenant_isolation` policy keyed on the
-- restaurant_id claim in the JWT. `restaurants` gets `restaurant_own` (own row).
-- The service_role key bypasses RLS automatically in Supabase, so superadmin and
-- cron paths (via supabaseAdmin) are unaffected.
--
-- Policies are FOR ALL with only a USING clause: Postgres reuses the USING
-- expression as the WITH CHECK for INSERT/UPDATE, so reads AND writes are
-- isolated to the caller's restaurant_id.
--
-- DEVIATION FROM SPEC (documented in Docmost ADR): the spec's migration 019
-- ALTER list omitted item_variants, smtp_config and email_log. They all carry a
-- restaurant_id (smtp_config holds an encrypted password), so RLS is enabled on
-- them here too — leaving them open would defeat tenant isolation. plans and
-- invites remain platform tables with no RLS (service-role / superadmin only),
-- per the schema context.

-- ── Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE menu_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_variants       ENABLE ROW LEVEL SECURITY;  -- added (hardening)
ALTER TABLE modifier_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_options    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_hours     ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_closures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE smtp_config         ENABLE ROW LEVEL SECURITY;  -- added (hardening)
ALTER TABLE payment_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log           ENABLE ROW LEVEL SECURITY;  -- added (hardening)
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants         ENABLE ROW LEVEL SECURITY;

-- ── Tenant isolation policies (restaurant_id = JWT claim) ─────────────────
CREATE POLICY tenant_isolation ON menu_categories
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON menu_items
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON item_variants
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON modifier_groups
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON modifier_options
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON orders
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON order_items
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON operating_hours
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON special_closures
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON promotions
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON notices
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON notification_config
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON smtp_config
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON payment_config
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON webhook_config
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON webhook_deliveries
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON audit_log
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON email_log
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);
CREATE POLICY tenant_isolation ON users
  USING ((auth.jwt() ->> 'restaurant_id')::uuid = restaurant_id);

-- ── Restaurants: own row only ─────────────────────────────────────────────
CREATE POLICY restaurant_own ON restaurants
  USING (id = (auth.jwt() ->> 'restaurant_id')::uuid);
