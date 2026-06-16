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
  staff_cap: z.number().int().min(1).max(1000),
  item_cap: z.number().int().min(1).max(10000),
  category_cap: z.number().int().min(1).max(1000),
  modifier_cap: z.number().int().min(1).max(10000),
  smtp_monthly_limit: z.number().int().min(0).nullable(),
  transaction_history_days: z.number().int().min(1).nullable(),
  feature_flags: featureFlagsSchema,
  payment_methods_allowed: z.array(paymentMethodSchema).min(1),
})

/** Update-plan body: any subset of create fields. Rejects an empty object. */
export const updatePlanSchema = createPlanSchema.partial().refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'at least one field is required' },
)

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>
