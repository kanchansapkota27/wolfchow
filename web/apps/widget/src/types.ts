// ── Public API types (mirrors backend public routes) ─────────────────────────

export interface WidgetSettings {
  restaurant_id: string
  slug: string
  display_name: string
  logo_url: string | null
  brand_colors: { primary: string; secondary: string; accent: string; text: string } | null
  font_family: string | null
  currency: string
  timezone: string
  payment_methods: string[]
  stripe_publishable_key: string | null
  pickup_delivery_note: string | null
  tips: {
    enabled: boolean
    presets: number[]
    allow_custom: boolean
    show_no_tip: boolean
  }
  tax: { enabled: boolean; rate: number; inclusive: boolean }
  orders_paused: boolean
  pause_reason: string | null
  /** Where menu item photos are shown, independent of the menu_photos plan flag. */
  menu_image_display: 'off' | 'desktop' | 'mobile' | 'both'
  features: {
    menu_photos: boolean
    item_modifiers: boolean
    promotions_enabled: boolean
    scheduled_orders_enabled: boolean
    order_tracking_page: boolean
    remove_powered_by: boolean
    custom_brand_color: boolean
  }
  scheduling: {
    enabled: true
    base_prep_minutes: number
    interval_minutes: number
  } | null
  notices: Array<{
    id: string
    type: string
    message: string
    display_locations: string[]
    priority: number
  }>
  media_base_url: string
}

export interface PublicModifierOption {
  id: string
  name: string
  price_delta: number
  available: boolean
}

export interface PublicModifierGroup {
  id: string
  name: string
  type: 'single' | 'multi'
  required: boolean
  sort_order: number
  options: PublicModifierOption[]
}

export interface PublicVariant {
  id: string
  name: string
  price: number
  is_default: boolean
  sort_order: number
  available: boolean
}

export interface PublicMenuItem {
  id: string
  name: string
  description: string | null
  price: number
  availability_state: string
  image_url: string | null
  tags: string[]
  has_variants: boolean
  sort_order: number
  variants: PublicVariant[]
  modifier_groups: PublicModifierGroup[]
}

export interface PublicMenuCategory {
  id: string
  name: string
  sort_order: number
  items: PublicMenuItem[]
}

// ── Cart ─────────────────────────────────────────────────────────────────────

export interface CartModifier {
  group_id: string
  option_id: string
  name: string
  price_delta: number
}

export interface CartItem {
  id: string  // client-side unique key
  item_id: string
  item_name: string
  variant_id: string | null
  variant_name: string | null
  base_price: number
  modifiers: CartModifier[]
  quantity: number
  notes: string
  unit_price: number  // base_price + sum(modifier price_deltas)
}

// ── Checkout ─────────────────────────────────────────────────────────────────

export interface CheckoutForm {
  customer_name: string
  customer_email: string
  customer_phone: string
  payment_method: string
  scheduled_for: string | null
  promo_code: string
  tip_amount: number
  notes: string
  marketing_consent: boolean
}

export interface PromoValidation {
  valid: boolean
  promo_id?: string
  title?: string
  discount_type?: string
  discount_value?: number
  discount_amount?: number
  free_item_id?: string | null
  message?: string
}

export interface CreateOrderResult {
  order_id: string
  tracking_token: string
  /** Short per-restaurant daily order number (e.g. 101 → shown as "#101"). Null for the rare case the counter DO call failed at creation time. */
  order_number: number | null
  created_at: string
  client_secret: string | null
  total: number
  currency: string
  items: Array<{
    item_name: string | null
    variant_name: string | null
    quantity: number
    unit_price: number
    modifiers: Array<{ name: string; price_delta: number }>
    notes: string | null
  }>
  subtotal: number
  promo_discount: number
  tax_amount: number
  tax_inclusive: boolean
  tip_amount: number
}

export interface OrderTrackingResult {
  order_id: string
  tracking_token: string
  order_number: number | null
  status: string
  payment_method: string
  customer_name: string
  subtotal: number
  promo_discount: number
  tax_amount: number
  tip_amount: number
  total: number
  created_at: string
  scheduled_for: string | null
  estimated_ready: string
  // No per-item/modifier price fields — the backend deliberately omits them
  // (SEC-010: no itemized price leakage from this token-only public endpoint).
  items: Array<{
    id: string
    item_name: string | null
    variant_name: string | null
    quantity: number
    modifiers: Array<{ name: string }>
    notes: string | null
  }>
}

// ── App state ─────────────────────────────────────────────────────────────────

export type WidgetView =
  | 'loading'
  | 'error'
  | 'menu'
  | 'item'
  | 'cart'
  | 'checkout'
  | 'processing'
  | 'success'
  | 'tracking'

export interface WidgetState {
  view: WidgetView
  settings: WidgetSettings | null
  menu: PublicMenuCategory[]
  cart: CartItem[]
  selectedItem: PublicMenuItem | null
  checkoutForm: CheckoutForm
  promo: PromoValidation | null
  orderResult: CreateOrderResult | null
  error: string | null
}
