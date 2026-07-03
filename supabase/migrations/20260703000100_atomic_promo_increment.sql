-- Atomic promo usage counter increment.
-- Increments usage_count only if still under the limit, returning true on success.
-- Prevents race conditions where concurrent orders all read the same count and
-- all pass the eligibility check, overshooting the usage limit.
CREATE OR REPLACE FUNCTION increment_promo_usage(
  _promo_id uuid,
  _max_usage integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _rows integer;
BEGIN
  UPDATE promotions
  SET usage_count = usage_count + 1
  WHERE id = _promo_id
    AND (_max_usage IS NULL OR usage_count < _max_usage);

  GET DIAGNOSTICS _rows = ROW_COUNT;
  RETURN _rows > 0;
END;
$$;
