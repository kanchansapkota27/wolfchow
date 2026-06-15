-- STORY-002 · Audit trigger (spec migration 020)
--
-- audit_trigger_fn() writes a row to audit_log for every INSERT/UPDATE/DELETE on
-- the tables it is attached to.
--
-- DEVIATION FROM SPEC (documented in Docmost ADR): the spec function references
-- NEW.restaurant_id directly, but it is attached to `restaurants` and `plans`,
-- which have no restaurant_id column — a direct field reference would raise
-- `record "new" has no field "restaurant_id"` at runtime. The function below
-- derives the tenant id from a to_jsonb() payload instead (missing key -> null),
-- falling back to `id` for the restaurants table. Behaviour for tenant tables is
-- identical to the spec; old_data/new_data semantics are preserved exactly.

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  payload jsonb := to_jsonb(COALESCE(NEW, OLD));
  rid uuid;
BEGIN
  rid := COALESCE(
    payload ->> 'restaurant_id',
    CASE WHEN TG_TABLE_NAME = 'restaurants' THEN payload ->> 'id' END
  )::uuid;

  INSERT INTO audit_log(restaurant_id, table_name, operation, old_data, new_data, user_id)
  VALUES (
    rid,
    TG_TABLE_NAME,
    TG_OP,
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    (auth.jwt() ->> 'sub')::uuid
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Apply trigger to all mutable tables (spec migration 020 list)
CREATE TRIGGER audit_menu_items         AFTER INSERT OR UPDATE OR DELETE ON menu_items         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_menu_categories    AFTER INSERT OR UPDATE OR DELETE ON menu_categories    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_modifier_groups    AFTER INSERT OR UPDATE OR DELETE ON modifier_groups    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_modifier_options   AFTER INSERT OR UPDATE OR DELETE ON modifier_options   FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_orders             AFTER INSERT OR UPDATE OR DELETE ON orders             FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_operating_hours    AFTER INSERT OR UPDATE OR DELETE ON operating_hours    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_special_closures   AFTER INSERT OR UPDATE OR DELETE ON special_closures   FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_promotions         AFTER INSERT OR UPDATE OR DELETE ON promotions         FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_notices            AFTER INSERT OR UPDATE OR DELETE ON notices            FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_notification_config AFTER INSERT OR UPDATE OR DELETE ON notification_config FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_payment_config     AFTER INSERT OR UPDATE OR DELETE ON payment_config     FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_smtp_config        AFTER INSERT OR UPDATE OR DELETE ON smtp_config        FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_restaurants        AFTER INSERT OR UPDATE OR DELETE ON restaurants        FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_users              AFTER INSERT OR UPDATE OR DELETE ON users              FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
CREATE TRIGGER audit_plans              AFTER INSERT OR UPDATE OR DELETE ON plans              FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();
