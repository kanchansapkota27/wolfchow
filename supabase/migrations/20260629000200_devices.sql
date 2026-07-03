-- Add device_cap to plans (separate limit from human staff)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS device_cap integer NOT NULL DEFAULT 3;
UPDATE plans SET device_cap = 2 WHERE name = 'Starter';
UPDATE plans SET device_cap = 5 WHERE name = 'Growth';
UPDATE plans SET device_cap = 20 WHERE name = 'Pro';

-- Dedicated devices table — decoupled from users/staff
CREATE TABLE IF NOT EXISTS devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  permissions   text[] NOT NULL DEFAULT ARRAY['orders:accept_reject','orders:status'],
  device_uuid   text,           -- UUID stored in PWA localStorage, set on first login
  platform      text,           -- e.g. "iPad · Safari 17", captured at login
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz     -- NULL = active
);

CREATE INDEX IF NOT EXISTS devices_restaurant_active_idx
  ON devices(restaurant_id)
  WHERE revoked_at IS NULL;
