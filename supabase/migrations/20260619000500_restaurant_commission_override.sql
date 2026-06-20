-- Commission now lives on the plan. Restaurants get an optional override.
-- Drop the old decimal commission_rate from restaurants.
ALTER TABLE restaurants DROP COLUMN IF EXISTS commission_rate;

-- Optional per-restaurant commission override (takes precedence over plan default).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS override_commission_type text
    CHECK (override_commission_type IN ('percentage', 'fixed'));

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS override_commission_value integer
    CHECK (override_commission_value >= 0);

COMMENT ON COLUMN restaurants.override_commission_type IS
  'Overrides the plan commission_type when set. NULL = use plan default.';
COMMENT ON COLUMN restaurants.override_commission_value IS
  'Overrides the plan commission_value when set. Basis points for percentage; cents for fixed. NULL = use plan default.';

-- Must drop and recreate because the return type changes (new columns).
DROP FUNCTION IF EXISTS public.superadmin_billing_summary();
DROP FUNCTION IF EXISTS public.superadmin_billing_monthly(uuid);

-- Updated billing functions using COALESCE(restaurant override, plan default).
-- commission_value basis-point math: value * bps / 10000
--   e.g. $100 order × 500 bps  = $5.00
-- fixed math: flat monthly fee = value_cents / 100
CREATE OR REPLACE FUNCTION public.superadmin_billing_summary()
RETURNS TABLE (
  id uuid,
  display_name text,
  slug text,
  plan_id uuid,
  effective_commission_type text,
  effective_commission_value integer,
  billing_note text,
  total_orders bigint,
  total_order_value numeric,
  total_orders_30d bigint,
  total_order_value_30d numeric,
  estimated_commission_30d numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    r.id,
    r.display_name,
    r.slug,
    r.plan_id,
    COALESCE(r.override_commission_type, p.commission_type, 'percentage') AS effective_commission_type,
    COALESCE(r.override_commission_value, p.commission_value, 0)          AS effective_commission_value,
    r.billing_note,
    COUNT(o.id)                                                            AS total_orders,
    COALESCE(SUM(o.total), 0)                                             AS total_order_value,
    COUNT(o.id)   FILTER (WHERE o.created_at > now() - interval '30 days') AS total_orders_30d,
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at > now() - interval '30 days'), 0)
                                                                          AS total_order_value_30d,
    CASE
      WHEN COALESCE(r.override_commission_type, p.commission_type, 'percentage') = 'fixed'
        THEN COALESCE(r.override_commission_value, p.commission_value, 0) / 100.0
      ELSE
        COALESCE(SUM(o.total) FILTER (WHERE o.created_at > now() - interval '30 days'), 0)
        * COALESCE(r.override_commission_value, p.commission_value, 0) / 10000.0
    END                                                                   AS estimated_commission_30d
  FROM public.restaurants r
  LEFT JOIN public.plans p ON p.id = r.plan_id AND p.deleted_at IS NULL
  LEFT JOIN public.orders o
         ON o.restaurant_id = r.id AND o.payment_status = 'captured'
  GROUP BY r.id, p.commission_type, p.commission_value
  ORDER BY total_order_value_30d DESC NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_billing_monthly(p_restaurant_id uuid)
RETURNS TABLE (
  month timestamptz,
  order_count bigint,
  order_value numeric,
  estimated_commission numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    date_trunc('month', o.created_at) AS month,
    COUNT(*)                           AS order_count,
    COALESCE(SUM(o.total), 0)         AS order_value,
    CASE
      WHEN COALESCE(r.override_commission_type, p.commission_type, 'percentage') = 'fixed'
        THEN COALESCE(r.override_commission_value, p.commission_value, 0) / 100.0
      ELSE
        COALESCE(SUM(o.total), 0)
        * COALESCE(r.override_commission_value, p.commission_value, 0) / 10000.0
    END AS estimated_commission
  FROM public.orders o
  JOIN  public.restaurants r ON r.id = o.restaurant_id
  LEFT JOIN public.plans p   ON p.id = r.plan_id AND p.deleted_at IS NULL
  WHERE o.restaurant_id = p_restaurant_id
    AND o.payment_status = 'captured'
  GROUP BY
    date_trunc('month', o.created_at),
    r.override_commission_type, r.override_commission_value,
    p.commission_type, p.commission_value
  ORDER BY month DESC
  LIMIT 12;
$$;

REVOKE EXECUTE ON FUNCTION public.superadmin_billing_summary()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.superadmin_billing_monthly(uuid)    FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.superadmin_billing_summary()        TO service_role;
GRANT  EXECUTE ON FUNCTION public.superadmin_billing_monthly(uuid)    TO service_role;
