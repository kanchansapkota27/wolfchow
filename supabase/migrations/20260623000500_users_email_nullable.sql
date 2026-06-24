-- Allow device accounts (tablet_device role) to have no email address.
-- Human staff accounts must still have an email; tablets identify via device_id.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_email_or_device
  CHECK (email IS NOT NULL OR device_id IS NOT NULL);
