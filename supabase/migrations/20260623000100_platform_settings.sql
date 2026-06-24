-- ── platform_settings — singleton table for superadmin-configurable values ──
-- One row only (id = 1 enforced by check constraint). GET/PATCH via
-- /superadmin/settings; webhook_signing_secret regenerated via
-- POST /superadmin/settings/webhook-secret.

CREATE TABLE platform_settings (
  id                     integer PRIMARY KEY DEFAULT 1,
  jwt_expiry_minutes     integer NOT NULL DEFAULT 60,
  global_rate_limit      integer NOT NULL DEFAULT 100,
  maintenance_mode       boolean NOT NULL DEFAULT false,
  support_email          text    NOT NULL DEFAULT '',
  r2_public_domain       text    NOT NULL DEFAULT '',
  webhook_signing_secret text    NOT NULL DEFAULT '',
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id = 1)
);

-- Seed the single row so GET always returns data.
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Only service_role may read/write this table.
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON platform_settings USING (auth.role() = 'service_role');
