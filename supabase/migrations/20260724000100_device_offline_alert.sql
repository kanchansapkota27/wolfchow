-- Tracks whether the "all kitchen devices offline" owner alert has already
-- been sent for the current offline streak, so the cron sweep (runs every
-- minute) doesn't re-send the same alert every tick. Cleared once any device
-- reports back online.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS device_offline_alert_sent_at timestamptz;
