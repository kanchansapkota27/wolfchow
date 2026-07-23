-- Restaurant-level control over where menu item photos are shown in the
-- widget (independent of the menu_photos plan feature flag, which gates
-- whether photos are available at all).
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS menu_image_display text NOT NULL DEFAULT 'both';

ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_menu_image_display_check
  CHECK (menu_image_display IN ('off', 'desktop', 'mobile', 'both'));
