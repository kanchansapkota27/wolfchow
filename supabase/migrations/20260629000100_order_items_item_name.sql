-- item_name snapshot — captures the menu item name at order time so the
-- admin can always read what was ordered even if the item is later renamed or deleted.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_name text;
