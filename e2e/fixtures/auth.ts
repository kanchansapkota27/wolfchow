import type { Page } from '@playwright/test'

/** Logs into any app using the shared LoginPage's staff-login form (admin, superadmin). */
export async function loginAsStaff(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

/** Logs into the tablet app via a device token. */
export async function loginTabletDevice(page: Page, deviceToken: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('DEVICE TOKEN').fill(deviceToken)
  await page.getByRole('button', { name: 'CONNECT DEVICE' }).click()
}
