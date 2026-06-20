import type { CommissionType, FeatureFlags, PaymentMethod, Plan, PlanInput } from '@wolfchow/types'

/** The 11 settable feature flags with their human labels, in display order. */
export const FEATURE_FLAGS: Array<{ key: keyof FeatureFlags; label: string }> = [
  { key: 'menu_photos', label: 'Menu item photos' },
  { key: 'item_modifiers', label: 'Item modifiers' },
  { key: 'category_scheduling', label: 'Category scheduling' },
  { key: 'email_notifications', label: 'Email notifications' },
  { key: 'order_tracking_page', label: 'Order tracking page' },
  { key: 'analytics_dashboard', label: 'Analytics dashboard' },
  { key: 'export_orders_csv', label: 'CSV export' },
  { key: 'custom_brand_color', label: 'Custom brand colour' },
  { key: 'remove_powered_by', label: "Remove 'Powered by'" },
  { key: 'promotions_enabled', label: 'Promotions & discounts' },
  { key: 'scheduled_orders_enabled', label: 'Scheduled orders' },
]

export const COMMISSION_TYPES: Array<{ value: CommissionType; label: string; hint: string }> = [
  { value: 'percentage', label: 'Percentage', hint: '% of order total' },
  { value: 'fixed', label: 'Fixed amount', hint: 'flat $ per order' },
]

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'card', label: 'Card' },
  { value: 'pickup', label: 'Pay on Pickup' },
  { value: 'delivery', label: 'Pay on Delivery' },
]

function emptyFlags(): FeatureFlags {
  return Object.fromEntries(FEATURE_FLAGS.map((flag) => [flag.key, false])) as unknown as FeatureFlags
}

/** Defaults for a brand-new plan. */
export function emptyPlanInput(): PlanInput {
  return {
    name: '',
    staff_cap: 5,
    item_cap: 50,
    category_cap: 10,
    modifier_cap: 20,
    smtp_monthly_limit: 500,
    transaction_history_days: 30,
    feature_flags: emptyFlags(),
    payment_methods_allowed: ['card'],
    commission_type: 'percentage',
    commission_value: 0,
    is_public: false,
  }
}

/** Strip a fetched plan down to the editable input shape. */
export function planToInput(plan: Plan): PlanInput {
  return {
    name: plan.name,
    staff_cap: plan.staff_cap,
    item_cap: plan.item_cap,
    category_cap: plan.category_cap,
    modifier_cap: plan.modifier_cap,
    smtp_monthly_limit: plan.smtp_monthly_limit,
    transaction_history_days: plan.transaction_history_days,
    feature_flags: { ...emptyFlags(), ...plan.feature_flags },
    payment_methods_allowed: [...plan.payment_methods_allowed],
    commission_type: plan.commission_type ?? 'percentage',
    commission_value: plan.commission_value ?? 0,
    is_public: plan.is_public ?? false,
  }
}
