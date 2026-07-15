import type { Page } from '@playwright/test'

/**
 * Logs into any app using the shared LoginPage's staff-login form (admin,
 * superadmin). Waits for the app to navigate away from /login before
 * returning — signInWithPassword() stores the session and redirects
 * asynchronously, so an immediate goto() right after the click can race it
 * and bounce back to /login.
 */
export async function loginAsStaff(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
}

/** Logs into the tablet app via a device token. Same async-redirect race as loginAsStaff. */
export async function loginTabletDevice(page: Page, deviceToken: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('DEVICE TOKEN').fill(deviceToken)
  await page.getByRole('button', { name: 'CONNECT DEVICE' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
}
