-- pause_scheduled_orders was referenced in pause routes but never added to the schema.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS pause_scheduled_orders boolean NOT NULL DEFAULT false;
