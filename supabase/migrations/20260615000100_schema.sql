-- STORY-002 · Database schema (spec migrations 001–018)
-- Tables, indexes, and seed data. RLS (019) and audit trigger (020) follow in
-- later migration files. Tables are ordered to satisfy FK dependencies.

-- ── Migration 001 — plans ────────────────────────────────────────────────
CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  staff_cap int NOT NULL DEFAULT 5,
  item_cap int NOT NULL DEFAULT 50,
  category_cap int NOT NULL DEFAULT 10,
  modifier_cap int NOT NULL DEFAULT 20,
  smtp_monthly_limit int,           -- null = unlimited (own SMTP)
  transaction_history_days int DEFAULT 30,  -- 30 / 365 / null(unlimited); nullable so Pro can be unlimited (spec seed inserts null)
  feature_flags jsonb NOT NULL DEFAULT '{}',
  payment_methods_allowed text[] NOT NULL DEFAULT '{card}',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (name, staff_cap, item_cap, category_cap, modifier_cap, smtp_monthly_limit, transaction_history_days, feature_flags, payment_methods_allowed) VALUES
('Starter', 3, 50, 10, 20, 500, 30, '{"menu_photos":false,"item_modifiers":false,"category_scheduling":false,"email_notifications":true,"order_tracking_page":false,"analytics_dashboard":false,"export_orders_csv":false,"custom_brand_color":false,"remove_powered_by":false,"webhook_export":false,"promotions_enabled":false,"scheduled_orders_enabled":false}', '{card}'),
('Growth', 10, 200, 30, 100, 2000, 365, '{"menu_photos":true,"item_modifiers":true,"category_scheduling":false,"email_notifications":true,"order_tracking_page":true,"analytics_dashboard":true,"export_orders_csv":false,"custom_brand_color":true,"remove_powered_by":false,"webhook_export":false,"promotions_enabled":true,"scheduled_orders_enabled":true}', '{card,pickup}'),
('Pro', 50, 1000, 100, 500, null, null, '{"menu_photos":true,"item_modifiers":true,"category_scheduling":true,"email_notifications":true,"order_tracking_page":true,"analytics_dashboard":true,"export_orders_csv":true,"custom_brand_color":true,"remove_powered_by":true,"webhook_export":true,"promotions_enabled":true,"scheduled_orders_enabled":true}', '{card,pickup,delivery}');

-- ── Migration 002 — restaurants ──────────────────────────────────────────
CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  business_name text NOT NULL,
  timezone text NOT NULL,                   -- IANA timezone string
  currency text NOT NULL DEFAULT 'TRY',     -- ISO 4217
  address jsonb NOT NULL DEFAULT '{}',
  logo_r2_key text,
  brand_colors jsonb NOT NULL DEFAULT '{}', -- { primary, secondary, accent, text }
  cuisine_type text,
  services_offered text[] DEFAULT '{}',
  social_links jsonb NOT NULL DEFAULT '{}',
  delivery_links jsonb NOT NULL DEFAULT '{}',
  plan_id uuid REFERENCES plans(id),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0,  -- e.g. 0.0200 = 2%
  billing_note text,
  active boolean NOT NULL DEFAULT true,
  -- scheduling config
  base_prep_minutes int NOT NULL DEFAULT 20,
  scheduling_interval int NOT NULL DEFAULT 15,   -- 15 or 30
  future_days_allowed int NOT NULL DEFAULT 7,
  -- tax config
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,        -- e.g. 18.00 = 18%
  tax_inclusive boolean NOT NULL DEFAULT true,
  -- tip config
  tips_enabled boolean NOT NULL DEFAULT false,
  tip_presets int[] NOT NULL DEFAULT '{10,15,20}',
  allow_custom_tip boolean NOT NULL DEFAULT true,
  show_no_tip boolean NOT NULL DEFAULT true,
  -- automation
  auto_accept boolean NOT NULL DEFAULT false,
  auto_reject_enabled boolean NOT NULL DEFAULT false,
  auto_reject_minutes int NOT NULL DEFAULT 10,
  -- pause state
  orders_paused boolean NOT NULL DEFAULT false,
  pause_until timestamptz,
  pause_reason text,
  pause_mode text,                         -- timed | manual | rest_of_day
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Migration 003 — users ────────────────────────────────────────────────
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  role text NOT NULL,                      -- superadmin | support | restaurant_owner | kitchen
  name text NOT NULL,
  phone text,
  email text NOT NULL,
  device_id text,                          -- for tablet device accounts
  permissions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_restaurant ON users(restaurant_id);

-- ── Migration 004 — invites ──────────────────────────────────────────────
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,              -- inv_ + 32-byte hex
  plan_id uuid NOT NULL REFERENCES plans(id),
  commission_rate numeric(5,4) NOT NULL DEFAULT 0,
  billing_note text,
  email text,                              -- optional pre-assign
  used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  used_by_restaurant_id uuid REFERENCES restaurants(id),
  expires_at timestamptz NOT NULL,        -- created_at + 72h
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Migration 005 — menu_categories ──────────────────────────────────────
CREATE TABLE menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  availability_state text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_categories_restaurant ON menu_categories(restaurant_id, active);

-- ── Migration 006 — menu_items & item_variants ───────────────────────────
CREATE TABLE menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  availability_state text NOT NULL DEFAULT 'in_stock',  -- in_stock | out_of_stock | limited | hidden
  restore_at timestamptz,
  image_r2_key text,
  tags text[] NOT NULL DEFAULT '{}',  -- vegan, vegetarian, spicy, gluten_free, contains_nuts, halal, dairy_free
  has_variants boolean NOT NULL DEFAULT false,  -- if true, price ignored; use item_variants
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_menu_items_restaurant ON menu_items(restaurant_id, availability_state);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_tags ON menu_items USING GIN(tags);

CREATE TABLE item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,              -- e.g. "Small", "Medium", "Large"
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  is_default boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  available boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_item_variants_item ON item_variants(item_id);
-- exactly one variant per item must have is_default = true (enforced at app layer)

-- ── Migration 007 — modifier_groups & modifier_options ───────────────────
CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('single', 'multi')),
  required boolean NOT NULL DEFAULT false,
  availability_state text NOT NULL DEFAULT 'available',
  sort_order int NOT NULL DEFAULT 0
);

CREATE TABLE modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric(10,2) NOT NULL DEFAULT 0,
  available boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_modifier_groups_item ON modifier_groups(item_id);
CREATE INDEX idx_modifier_options_group ON modifier_options(group_id);

-- ── Migration 008 — orders ───────────────────────────────────────────────
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  tracking_token text UNIQUE NOT NULL,     -- ord_live_ + 32-byte hex
  status text NOT NULL DEFAULT 'pending_payment',
  -- pending_payment | scheduled | auth_success | accepted | preparing | ready | completed | rejected | missed | refunded
  payment_method text NOT NULL,           -- card | pickup | delivery
  payment_status text NOT NULL DEFAULT 'pending',  -- pending | authorized | captured | cancelled | refunded
  stripe_intent_id text,
  stripe_amount_authorized int,           -- in smallest currency unit
  accept_deadline_at timestamptz,
  auto_accept boolean NOT NULL DEFAULT false,  -- snapshot of restaurant setting at order time
  scheduled_for timestamptz,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  tip_amount numeric(10,2) NOT NULL DEFAULT 0,
  promo_id uuid,
  promo_discount numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(10,2) NOT NULL,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_inclusive boolean NOT NULL DEFAULT true,
  total numeric(10,2) NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX idx_orders_tracking_token ON orders(tracking_token);
CREATE INDEX idx_orders_accept_deadline ON orders(accept_deadline_at) WHERE status = 'auth_success';

-- ── Migration 009 — order_items ──────────────────────────────────────────
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  item_id uuid NOT NULL REFERENCES menu_items(id),
  variant_id uuid REFERENCES item_variants(id),
  variant_name text,        -- snapshot — variant could be deleted/renamed later
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(10,2) NOT NULL,
  modifiers jsonb NOT NULL DEFAULT '[]',  -- [{ group_id, option_id, name, price_delta }]
  notes text
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ── Migration 010 — operating_hours ──────────────────────────────────────
CREATE TABLE operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  open_time time NOT NULL,
  close_time time NOT NULL,
  crosses_midnight boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  last_order_offset_minutes int NOT NULL DEFAULT 15,
  UNIQUE(restaurant_id, day_of_week)
);

-- ── Migration 011 — special_closures ─────────────────────────────────────
CREATE TABLE special_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  closure_type text NOT NULL,  -- full | partial | holiday | emergency | maintenance | special
  date date NOT NULL,
  partial_open time,
  partial_close time,
  recurring boolean NOT NULL DEFAULT false,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_closures_restaurant_date ON special_closures(restaurant_id, date);

-- ── Migration 012 — promotions ───────────────────────────────────────────
CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  promo_code text,
  discount_type text NOT NULL,  -- percentage | fixed | free_item | bogo
  discount_value numeric(10,2) NOT NULL CHECK (discount_value > 0),
  free_item_id uuid REFERENCES menu_items(id),  -- required if discount_type IN (free_item, bogo)
  minimum_order_amount numeric(10,2),
  usage_limit int,
  usage_count int NOT NULL DEFAULT 0,
  auto_apply boolean NOT NULL DEFAULT false,
  start_time timestamptz,
  end_time timestamptz,
  active_days text[] DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, promo_code)
);
CREATE INDEX idx_promotions_restaurant ON promotions(restaurant_id, active);

-- ── Migration 013 — notices ──────────────────────────────────────────────
CREATE TABLE notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type text NOT NULL,  -- informational | warning | emergency | promotional
  message text NOT NULL,
  display_locations text[] NOT NULL,  -- storefront | checkout | tracking | tablet | admin
  priority int NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Migration 014 — notification_config ──────────────────────────────────
CREATE TABLE notification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  trigger_status text NOT NULL,  -- pending_payment | auth_success | accepted | preparing | ready | completed | rejected | refunded
  send_customer boolean NOT NULL DEFAULT true,
  internal_recipients text[] NOT NULL DEFAULT '{}',
  template_override text,
  UNIQUE(restaurant_id, trigger_status)
);

-- ── Migration 015 — smtp_config ──────────────────────────────────────────
CREATE TABLE smtp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,  -- null = global
  host text NOT NULL,
  port int NOT NULL DEFAULT 587,
  username text NOT NULL,
  encrypted_password text NOT NULL,  -- AES-256-GCM base64 blob
  from_email text NOT NULL,
  from_name text NOT NULL,
  monthly_limit int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id)
);

-- ── Migration 016 — payment_config ───────────────────────────────────────
CREATE TABLE payment_config (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  encrypted_stripe_secret text,       -- AES-256-GCM base64 blob
  stripe_publishable_key text,
  payment_methods_enabled text[] NOT NULL DEFAULT '{card}',
  pickup_delivery_note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Migration 016b — webhook_config & webhook_deliveries ─────────────────
CREATE TABLE webhook_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{order.status_changed}',  -- order.created | order.status_changed | order.refunded
  secret text NOT NULL,              -- plaintext, used for HMAC signing (generated by us)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_config_id uuid NOT NULL REFERENCES webhook_config(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  event text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',  -- pending | success | failed
  response_status int,
  attempt_count int NOT NULL DEFAULT 0,
  last_attempted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries(status, last_attempted_at) WHERE status IN ('pending','failed');

-- ── Migration 017 — audit_log ────────────────────────────────────────────
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,                  -- null for platform-level events
  table_name text NOT NULL,
  operation text NOT NULL,             -- INSERT | UPDATE | DELETE
  old_data jsonb,
  new_data jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_restaurant ON audit_log(restaurant_id, created_at DESC);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ── Migration 018 — email_log ────────────────────────────────────────────
CREATE TABLE email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid,
  to_address text NOT NULL,
  subject text NOT NULL,
  smtp_source text NOT NULL,           -- own | override | global
  sent_at timestamptz NOT NULL DEFAULT now()
);
