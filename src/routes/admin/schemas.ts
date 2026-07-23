import { z } from 'zod'

export const patchRestaurantSchema = z.object({
  display_name: z.string().min(1).optional(),
  business_name: z.string().min(1).optional(),
  address: z
    .object({
      line1: z.string().min(1),
      line2: z.string().optional(),
      city: z.string().min(1),
      state: z.string().optional(),
      postcode: z.string().optional(),
      country: z.string().min(1),
    })
    .optional(),
  brand_colors: z
    .object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
    })
    .optional(),
  cuisine_type: z.string().optional(),
  services_offered: z.array(z.string()).optional(),
  social_links: z.record(z.string(), z.string()).optional(),
  delivery_links: z.record(z.string(), z.string()).optional(),
  // Set after a successful PUT to the presigned URL from POST
  // /admin/restaurant/logo. The route handler validates this is actually the
  // caller's own key (not just any string) before persisting it.
  logo_r2_key: z.string().optional(),
  menu_image_display: z.enum(['off', 'desktop', 'mobile', 'both']).optional(),
  special_requests_enabled: z.boolean().optional(),
})

export const patchProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
})

export const patchPasswordSchema = z.object({
  password: z.string().min(8),
})
