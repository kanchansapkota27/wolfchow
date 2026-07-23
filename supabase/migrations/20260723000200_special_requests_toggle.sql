-- Restaurant-level default for whether customers can add special
-- instructions to an item, with a per-item override (NULL = inherit the
-- restaurant default).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS special_requests_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS special_requests_enabled boolean;
