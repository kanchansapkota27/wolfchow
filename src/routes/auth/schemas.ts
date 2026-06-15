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

/** Shape of a KV `DEVICE_TOKENS` record (`device:{token}`). */
export interface DeviceRecord {
  restaurant_id: string
  device_id: string
  name: string
  permissions: string[]
}
