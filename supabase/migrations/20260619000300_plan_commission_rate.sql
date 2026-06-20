-- Default commission rate for a plan.
-- Percentage type: stored as a fraction (0.05 = 5%).
-- Fixed type: stored as the flat currency amount per order (e.g. 2.50).
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS commission_rate numeric(10, 4) NOT NULL DEFAULT 0
    CHECK (commission_rate >= 0);

COMMENT ON COLUMN plans.commission_rate IS
  'Default commission rate. Fraction (0–1) when commission_type=percentage; flat amount per order when commission_type=fixed.';
