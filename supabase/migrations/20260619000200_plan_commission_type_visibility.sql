-- Commission type: 'percentage' (default, fractional 0–1) or 'fixed' (dollar amount per order)
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS commission_type text NOT NULL DEFAULT 'percentage'
    CHECK (commission_type IN ('percentage', 'fixed'));

-- Whether the plan can be surfaced on a public pricing page
-- Named is_public to avoid collision with PostgreSQL's reserved word 'public'
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN plans.commission_type IS
  'How commission_rate is interpreted: percentage = fraction of order total; fixed = flat amount per order.';
COMMENT ON COLUMN plans.is_public IS
  'If true the plan may appear on a public pricing/sign-up page.';
