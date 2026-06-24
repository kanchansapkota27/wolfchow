-- refund_id and refunded_at were written by the refund route but never added to the schema.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
