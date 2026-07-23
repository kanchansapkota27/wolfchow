-- Human-readable per-restaurant daily order number (displayed as "#101").
-- Generated at order-creation time via TenantCounterDO (atomic per-restaurant
-- counter, period = the restaurant's local date) — not DB-generated, so this
-- is a plain nullable integer, not a serial/identity column. Existing orders
-- predate this column and stay NULL; frontends fall back to a truncated id
-- for those.
ALTER TABLE orders ADD COLUMN order_number integer;

-- Supports "find order #101 for restaurant X" lookups (e.g. staff search).
CREATE INDEX idx_orders_restaurant_order_number ON orders (restaurant_id, order_number);
