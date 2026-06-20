import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
})

export const logoutSchema = z.object({
  refresh_token: z.string().min(1),
})

export const deviceSchema = z.object({
  device_token: z.string().min(1),
})

export const signupSchema = z.object({
  invite_token: z.string().startsWith('inv_'),
  admin_name: z.string().min(1),
  admin_phone: z.string().optional(),
  admin_email: z.string().email(),
  password: z.string().min(8),
  business_name: z.string().min(1),
  display_name: z.string().optional(),
  timezone: z.string(),
  currency: z.string().length(3),
  address: z.object({
    line1: z.string().min(1),
    city: z.string().min(1),
    country: z.string().min(1),
  }),
  slug: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/).optional(),
})

/** Shape of a KV `DEVICE_TOKENS` record (`device:{token}`). */
export interface DeviceRecord {
  restaurant_id: string
  device_id: string
  name: string
  permissions: string[]
}
