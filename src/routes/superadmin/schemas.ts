import { z } from 'zod'

/**
 * Feature flags carried on every plan. Exactly these 11 booleans are accepted on
 * create/update (unknown keys are stripped). NOTE: seed plans also carry a
 * `webhook_export` flag that pre-dates this story's schema; it is preserved on
 * existing rows but not settable here (see STORY-006 ADR/notes).
 */
export const featureFlagsSchema = z.object({
  menu_photos: z.boolean(),
  item_modifiers: z.boolean(),
  category_scheduling: z.boolean(),
  email_notifications: z.boolean(),
  order_tracking_page: z.boolean(),
  analytics_dashboard: z.boolean(),
  export_orders_csv: z.boolean(),
  custom_brand_color: z.boolean(),
  remove_powered_by: z.boolean(),
  promotions_enabled: z.boolean(),
  scheduled_orders_enabled: z.boolean(),
})

export const paymentMethodSchema = z.enum(['card', 'pickup', 'delivery'])

/** Create-plan body. All fields required; caps bounded per spec. */
export const createPlanSchema = z.object({
  name: z.string().min(1).max(50),
  device_cap: z.number().int().min(1).max(1000),
  item_cap: z.number().int().min(1).max(10000),
  category_cap: z.number().int().min(1).max(1000),
  modifier_cap: z.number().int().min(1).max(10000),
  smtp_monthly_limit: z.number().int().min(0).nullable(),
  transaction_history_days: z.number().int().min(1).nullable(),
  feature_flags: featureFlagsSchema,
  payment_methods_allowed: z.array(paymentMethodSchema).min(1),
  commission_type: z.enum(['percentage', 'fixed']).default('percentage'),
  commission_value: z.number().int().min(0).default(0),
  is_public: z.boolean().default(false),
})

/** Update-plan body: any subset of create fields. Rejects an empty object. */
export const updatePlanSchema = createPlanSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'at least one field is required' },
)

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>

/**
 * Create-invite body. `plan_id` is required and validated against the DB in the
 * handler; the rest are optional billing pre-fills. `commission_rate` is a
 * fraction (0.02 = 2%), bounded [0, 1).
 */
export const createInviteSchema = z.object({
  plan_id: z.string().uuid(),
  commission_rate: z.number().min(0).max(1).optional(),
  billing_note: z.string().max(500).optional(),
  email: z.string().email().optional(),
  restaurant_name: z.string().min(1).max(255).optional(),
})

/** Direct restaurant creation by superadmin (bypasses invite flow). */
export const createRestaurantDirectSchema = z.object({
  business_name: z.string().min(1).max(255),
  display_name: z.string().min(1).max(255).optional(),
  slug: z.string().min(2).max(63).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric and hyphens'),
  timezone: z.string().min(1).max(100),
  currency: z.string().length(3),
  country: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  plan_id: z.string().uuid().optional(),
  /** Optional override — omit to inherit the plan's commission. */
  override_commission_type: z.enum(['percentage', 'fixed']).optional(),
  override_commission_value: z.number().int().min(0).optional(),
})

export type CreateRestaurantDirectInput = z.infer<typeof createRestaurantDirectSchema>

export type CreateInviteInput = z.infer<typeof createInviteSchema>

/**
 * Superadmin restaurant update. Only billing/plan/active are mutable here; the
 * tenant owns the rest of its profile. Rejects an empty object.
 */
export const updateRestaurantSchema = z
  .object({
    plan_id: z.string().uuid(),
    override_commission_type: z.enum(['percentage', 'fixed']).nullable(),
    override_commission_value: z.number().int().min(0).nullable(),
    billing_note: z.string().max(500).nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'at least one field is required' })

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>

/** Global SMTP fallback config. Password is sealed before storage. */
export const smtpGlobalSchema = z.object({
  host: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(500),
  from_email: z.string().email(),
  from_name: z.string().min(1).max(255),
})

/** Per-restaurant SMTP override: the global fields plus a monthly send cap. */
export const smtpOverrideSchema = smtpGlobalSchema.extend({
  monthly_limit: z.number().int().min(0).nullable().optional(),
})

export type SmtpGlobalInput = z.infer<typeof smtpGlobalSchema>
export type SmtpOverrideInput = z.infer<typeof smtpOverrideSchema>

/** Create a restaurant owner account directly (superadmin-provisioned). */
export const createRestaurantUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
})

export type CreateRestaurantUserInput = z.infer<typeof createRestaurantUserSchema>
