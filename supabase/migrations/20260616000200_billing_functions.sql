-- STORY-010 · Commission & billing aggregates
--
-- PostgREST cannot express the correlated FILTER / GROUP BY aggregates these
-- dashboards need, so they live in SQL functions called via RPC by the
-- service-role client. Both count only captured orders. COALESCE keeps
-- restaurants with no orders at 0 (not NULL) so the API returns zeros, not nulls.

CREATE OR REPLACE FUNCTION public.superadmin_billing_summary()
RETURNS TABLE (
  id uuid,
  display_name text,
  slug text,
  plan_id uuid,
  commission_rate numeric,
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
    r.id, r.display_name, r.slug, r.plan_id, r.commission_rate, r.billing_note,
    COUNT(o.id) AS total_orders,
    COALESCE(SUM(o.total), 0) AS total_order_value,
    COUNT(o.id) FILTER (WHERE o.created_at > now() - interval '30 days') AS total_orders_30d,
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at > now() - interval '30 days'), 0) AS total_order_value_30d,
    COALESCE(SUM(o.total) FILTER (WHERE o.created_at > now() - interval '30 days'), 0) * r.commission_rate
      AS estimated_commission_30d
  FROM public.restaurants r
  LEFT JOIN public.orders o ON o.restaurant_id = r.id AND o.payment_status = 'captured'
  GROUP BY r.id
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
    COUNT(*) AS order_count,
    COALESCE(SUM(o.total), 0) AS order_value,
    COALESCE(SUM(o.total), 0) * r.commission_rate AS estimated_commission
  FROM public.orders o
  JOIN public.restaurants r ON r.id = o.restaurant_id
  WHERE o.restaurant_id = p_restaurant_id AND o.payment_status = 'captured'
  GROUP BY date_trunc('month', o.created_at), r.commission_rate
  ORDER BY month DESC
  LIMIT 12;
$$;

-- Only the service-role (superadmin routes) may run these cross-tenant aggregates.
REVOKE EXECUTE ON FUNCTION public.superadmin_billing_summary() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.superadmin_billing_monthly(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_billing_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_billing_monthly(uuid) TO service_role;
