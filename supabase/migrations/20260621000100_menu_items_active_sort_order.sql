-- Add missing columns to menu_items that the application code expects.
-- menu_categories already has these; menu_items was created without them.

ALTER TABLE menu_items
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN sort_order int NOT NULL DEFAULT 0;

-- Align the availability_state default with the backend Zod enum
-- ('available' | 'out_of_stock' | 'scheduled' | 'unavailable').
-- The original default 'in_stock' predates the current API contract.
ALTER TABLE menu_items
  ALTER COLUMN availability_state SET DEFAULT 'available';

-- Update existing rows that still carry the old default value so they
-- are queryable through the current enum.
UPDATE menu_items SET availability_state = 'available' WHERE availability_state = 'in_stock';
UPDATE menu_items SET availability_state = 'unavailable' WHERE availability_state = 'hidden';
UPDATE menu_items SET availability_state = 'available' WHERE availability_state = 'limited';

CREATE INDEX idx_menu_items_active ON menu_items(restaurant_id, active);
CREATE INDEX idx_menu_items_sort ON menu_items(category_id, sort_order);
