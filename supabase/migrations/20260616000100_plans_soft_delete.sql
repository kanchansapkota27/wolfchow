-- STORY-006 · Plan soft delete
--
-- Plans are referenced by restaurants (restaurants.plan_id → plans.id), so a
-- hard delete would either fail the FK or orphan tenants. Instead, DELETE
-- /superadmin/plans/:id sets deleted_at when no restaurant references the plan;
-- list/read queries filter on `deleted_at IS NULL`. A plan still in use returns
-- 409 and is never soft-deleted.

ALTER TABLE plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: list queries always filter to live plans.
CREATE INDEX IF NOT EXISTS plans_active_idx ON plans (id) WHERE deleted_at IS NULL;
