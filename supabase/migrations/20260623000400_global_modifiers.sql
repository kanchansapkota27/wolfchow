-- Global modifier groups: make item_id nullable so groups can be restaurant-level
-- (item_id = NULL), and add an assignment junction table.

-- 1. Make modifier_groups.item_id nullable.
--    Existing rows with item_id set are per-item groups; they remain valid.
ALTER TABLE modifier_groups ALTER COLUMN item_id DROP NOT NULL;

-- 2. Junction table: item → modifier_group assignments.
--    Replaces the item_id FK approach for the new global-group pattern.
CREATE TABLE item_modifier_groups (
  item_id          uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  modifier_group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  sort_order        int  NOT NULL DEFAULT 0,
  PRIMARY KEY (item_id, modifier_group_id)
);

CREATE INDEX idx_img_item  ON item_modifier_groups(item_id);
CREATE INDEX idx_img_group ON item_modifier_groups(modifier_group_id);

-- Grant the same permissions as modifier_groups.
GRANT SELECT, INSERT, UPDATE, DELETE ON item_modifier_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON item_modifier_groups TO service_role;
