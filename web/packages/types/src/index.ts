/**
 * @wolfchow/types — shared TypeScript types for every frontend app.
 *
 * These mirror the backend Zod schemas and Postgres schema (see
 * `wolfchow/src` and `wolfchow/supabase/migrations`). Keep this file in sync
 * when the backend contract changes; it is the single source of truth the apps
 * and the API client build against.
 */

// ── Identity & authorization ────────────────────────────────────────────────

export type Role =
  | 'superadmin'
  | 'support'
  | 'restaurant_owner'
  | 'kitchen'
  | 'tablet_device'

export type Permission =
  | 'orders:accept_reject'
  | 'orders:status'
  | 'inventory:write'
  | 'orders:pause'

export interface User {
  id: string
  restaurant_id: string | null
  role: Role
  name: string
  phone: string | null
  email: string
  device_id: string | null
  permissions: Permission[]
  active: boolean
  created_at: string
}

// ── Plans, restaurants, invites ──────────────────────────────────────────────

export type PaymentMethod = 'card' | 'pickup' | 'delivery'

/** The 11 settable plan feature flags (matches `featureFlagsSchema`). */
export interface FeatureFlags {
  menu_photos: boolean
  item_modifiers: boolean
  category_scheduling: boolean
  email_notifications: boolean
  order_tracking_page: boolean
  analytics_dashboard: boolean
  export_orders_csv: boolean
  custom_brand_color: boolean
  remove_powered_by: boolean
  promotions_enabled: boolean
  scheduled_orders_enabled: boolean
  /** Legacy flag carried on seed plans; not settable via the plan API. */
  webhook_export?: boolean
}

export type CommissionType = 'percentage' | 'fixed'

export interface Plan {
  id: string
  name: string
  staff_cap: number
  item_cap: number
  category_cap: number
  modifier_cap: number
  /** null = unlimited (restaurant uses its own SMTP). */
  smtp_monthly_limit: number | null
  /** null = unlimited history. */
  transaction_history_days: number | null
  feature_flags: FeatureFlags
  payment_methods_allowed: PaymentMethod[]
  /** How commission is applied: percentage of order total or flat per-order amount. */
  commission_type: CommissionType
  /**
   * Commission value stored as an integer.
   * percentage → basis points (500 = 5.00%)
   * fixed      → cents (250 = $2.50)
   * Divide by 100 to get the human-readable display value.
   */
  commission_value: number
  /** Whether this plan may appear on a public pricing page. */
  is_public: boolean
  created_at: string
  /** Number of restaurants on this plan (present on the superadmin list). */
  restaurant_count?: number
}

/** Settable fields when creating or updating a plan (no id/created_at). */
export interface PlanInput {
  name: string
  staff_cap: number
  item_cap: number
  category_cap: number
  modifier_cap: number
  smtp_monthly_limit: number | null
  transaction_history_days: number | null
  feature_flags: FeatureFlags
  payment_methods_allowed: PaymentMethod[]
  commission_type: CommissionType
  commission_value: number
  is_public: boolean
}

export interface BrandColors {
  primary?: string
  secondary?: string
  accent?: string
  text?: string
}

export interface Restaurant {
  id: string
  slug: string
  display_name: string
  business_name: string
  timezone: string
  currency: string
  address: Record<string, unknown>
  logo_r2_key: string | null
  brand_colors: BrandColors
  cuisine_type: string | null
  services_offered: string[]
  social_links: Record<string, string>
  delivery_links: Record<string, string>
  plan_id: string | null
  override_commission_type: CommissionType | null
  override_commission_value: number | null
  billing_note: string | null
  active: boolean
  base_prep_minutes: number
  scheduling_interval: number
  future_days_allowed: number
  tax_enabled: boolean
  tax_rate: number
  tax_inclusive: boolean
  tips_enabled: boolean
  tip_presets: number[]
  allow_custom_tip: boolean
  show_no_tip: boolean
  auto_accept: boolean
  auto_reject_enabled: boolean
  auto_reject_minutes: number
  orders_paused: boolean
  pause_until: string | null
  pause_reason: string | null
  pause_mode: string | null
  created_at: string
}

/** A row in the superadmin restaurant list (`GET /superadmin/restaurants`). */
export interface RestaurantListItem {
  id: string
  slug: string
  display_name: string
  plan_id: string | null
  plan_name: string | null
  active: boolean
  override_commission_type: CommissionType | null
  override_commission_value: number | null
  billing_note: string | null
  created_at: string
  order_count_30d: number
}

/** Fields a superadmin may change on a restaurant (`PATCH`). */
export interface RestaurantUpdate {
  plan_id?: string
  override_commission_type?: CommissionType | null
  override_commission_value?: number | null
  billing_note?: string | null
  active?: boolean
}

export type InviteStatus = 'pending' | 'used' | 'expired' | 'revoked'

/** A row in the superadmin invite list (`GET /superadmin/invites`). */
export interface InviteSummary {
  id: string
  token: string
  plan_id: string
  commission_rate: number
  billing_note: string | null
  email: string | null
  restaurant_name: string | null
  expires_at: string
  created_at: string
  used_at: string | null
  status: InviteStatus
}

/** Body for creating a restaurant directly (no invite flow). */
export interface CreateRestaurantInput {
  business_name: string
  display_name?: string
  slug: string
  timezone: string
  currency: string
  country?: string
  state?: string
  plan_id?: string
  /** Optional override — omit to inherit the plan's commission. */
  override_commission_type?: CommissionType
  override_commission_value?: number
}

/** Body for creating an invite. `commission_rate` is a fraction (0.02 = 2%). */
export interface CreateInviteInput {
  plan_id: string
  commission_rate?: number
  billing_note?: string
  email?: string
  restaurant_name?: string
}

/** Response from `POST /superadmin/invites`. */
export interface CreateInviteResult {
  id: string
  token: string
  invite_url: string
  expires_at: string
}

export interface Invite {
  id: string
  token: string
  plan_id: string
  commission_rate: number
  billing_note: string | null
  email: string | null
  used: boolean
  used_at: string | null
  used_by_restaurant_id: string | null
  expires_at: string
  created_at: string
  /** Derived server-side; convenient for list rendering. */
  status?: InviteStatus
}

// ── Menu ─────────────────────────────────────────────────────────────────────

export type AvailabilityState = 'in_stock' | 'out_of_stock' | 'limited' | 'hidden'

export interface MenuCategory {
  id: string
  restaurant_id: string
  name: string
  sort_order: number
  active: boolean
  availability_state: string
  created_at: string
}

export interface ItemVariant {
  id: string
  restaurant_id: string
  item_id: string
  name: string
  price: number
  is_default: boolean
  sort_order: number
  available: boolean
}

export type MenuItemTag =
  | 'vegan'
  | 'vegetarian'
  | 'spicy'
  | 'gluten_free'
  | 'contains_nuts'
  | 'halal'
  | 'dairy_free'

export interface MenuItem {
  id: string
  restaurant_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  availability_state: AvailabilityState
  restore_at: string | null
  image_r2_key: string | null
  tags: MenuItemTag[]
  has_variants: boolean
  variants?: ItemVariant[]
}

export type ModifierGroupType = 'single' | 'multi'

export interface ModifierOption {
  id: string
  group_id: string
  restaurant_id: string
  name: string
  price_delta: number
  available: boolean
}

export interface ModifierGroup {
  id: string
  restaurant_id: string
  item_id: string
  name: string
  type: ModifierGroupType
  required: boolean
  availability_state: string
  sort_order: number
  options?: ModifierOption[]
}

// ── Orders ─────────────────────────────────────────────────────────────────

/**
 * Customer-facing order lifecycle (the 9 statuses surfaced in the apps and the
 * tracking page). The backend also has a transient internal `scheduled`
 * pre-state for future orders; it is intentionally excluded from this union —
 * scheduled orders are identified by a non-null `scheduled_for` instead.
 */
export type OrderStatus =
  | 'pending_payment'
  | 'auth_success'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'rejected'
  | 'missed'
  | 'refunded'

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'cancelled'
  | 'refunded'

export interface OrderItemModifier {
  group_id: string
  option_id: string
  name: string
  price_delta: number
}

export interface OrderItem {
  id: string
  order_id: string
  restaurant_id: string
  item_id: string
  variant_id: string | null
  variant_name: string | null
  quantity: number
  unit_price: number
  modifiers: OrderItemModifier[]
  notes: string | null
}

export interface Order {
  id: string
  restaurant_id: string
  tracking_token: string
  status: OrderStatus
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  stripe_intent_id: string | null
  stripe_amount_authorized: number | null
  accept_deadline_at: string | null
  auto_accept: boolean
  scheduled_for: string | null
  customer_name: string
  customer_email: string
  customer_phone: string | null
  marketing_consent: boolean
  marketing_consent_at: string | null
  tip_amount: number
  promo_id: string | null
  promo_discount: number
  subtotal: number
  tax_amount: number
  tax_rate: number
  tax_inclusive: boolean
  total: number
  notes: string | null
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

// ── Promotions & notices ─────────────────────────────────────────────────────

export type DiscountType = 'percentage' | 'fixed' | 'free_item' | 'bogo'

export interface Promotion {
  id: string
  restaurant_id: string
  title: string
  description: string | null
  promo_code: string | null
  discount_type: DiscountType
  discount_value: number
  free_item_id: string | null
  minimum_order_amount: number | null
  usage_limit: number | null
  usage_count: number
  auto_apply: boolean
  start_time: string | null
  end_time: string | null
  active_days: string[]
  active: boolean
  created_at: string
}

export type NoticeType = 'informational' | 'warning' | 'emergency' | 'promotional'
export type NoticeLocation = 'storefront' | 'checkout' | 'tracking' | 'tablet' | 'admin'

export interface Notice {
  id: string
  restaurant_id: string
  type: NoticeType
  message: string
  display_locations: NoticeLocation[]
  priority: number
  starts_at: string | null
  expires_at: string | null
  active: boolean
  created_at: string
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export interface OperatingHours {
  id: string
  restaurant_id: string
  day_of_week: number
  open_time: string
  close_time: string
  crosses_midnight: boolean
  active: boolean
  last_order_offset_minutes: number
}

export type ClosureType =
  | 'full'
  | 'partial'
  | 'holiday'
  | 'emergency'
  | 'maintenance'
  | 'special'

export interface SpecialClosure {
  id: string
  restaurant_id: string
  closure_type: ClosureType
  date: string
  partial_open: string | null
  partial_close: string | null
  recurring: boolean
  reason: string | null
  created_at: string
}

// ── Billing ───────────────────────────────────────────────────────────────────

export interface BillingSummaryRow {
  id: string
  display_name: string
  slug: string
  plan_id: string | null
  effective_commission_type: CommissionType
  effective_commission_value: number
  billing_note: string | null
  total_orders: number
  total_order_value: number
  total_orders_30d: number
  total_order_value_30d: number
  estimated_commission_30d: number
}

export interface BillingMonthRow {
  month: string
  order_count: number
  order_value: number
  estimated_commission: number
}

// ── SMTP ─────────────────────────────────────────────────────────────────────

/** Public SMTP config row (password is never returned; `has_password` is the signal). */
export interface SmtpConfig {
  id: string
  restaurant_id: string | null
  host: string
  port: number
  username: string
  from_email: string
  from_name: string
  monthly_limit: number | null
  has_password: boolean
}

/** An entry in the per-restaurant SMTP overrides list. */
export interface SmtpOverrideItem extends SmtpConfig {
  restaurant_id: string
  restaurant_name: string | null
  monthly_used: number
}

export interface SmtpGlobalInput {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name: string
}

export interface SmtpOverrideInput extends SmtpGlobalInput {
  monthly_limit?: number | null
}

// ── Auth payloads ─────────────────────────────────────────────────────────────

export interface AuthSession {
  access_token: string
  refresh_token: string
  expires_in: number
  user: Pick<User, 'id' | 'email' | 'role'>
}
