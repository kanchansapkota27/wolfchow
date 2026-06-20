-- Replace commission_rate (numeric) with commission_value (integer, cents/basis-points).
-- Fixed type  : stored in cents        (250  = $2.50).
-- Percentage  : stored in basis points (500  = 5.00%).
-- Dividing by 100 always gives the human-readable display value.

ALTER TABLE plans
  DROP COLUMN IF EXISTS commission_rate;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS commission_value integer NOT NULL DEFAULT 0
    CHECK (commission_value >= 0);

COMMENT ON COLUMN plans.commission_value IS
  'Commission value as an integer. Basis points (1/100 of a percent) when commission_type=percentage; cents when commission_type=fixed. Always divide by 100 for display.';
