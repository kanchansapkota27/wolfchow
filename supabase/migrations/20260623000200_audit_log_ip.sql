-- Add ip_address to audit_log so auth events (LOGIN, LOGOUT, DEVICE_LOGIN,
-- IMPERSONATION_START/END) can record the caller's IP address.
-- Nullable — existing rows and non-auth events leave it null.

ALTER TABLE audit_log ADD COLUMN ip_address text;
