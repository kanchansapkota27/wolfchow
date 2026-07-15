import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'

test.describe('E2E-01 · signup via invite', () => {
  test.use({ baseURL: 'http://localhost:5174' })

  test('3-step form → arrives at admin dashboard', async ({ page }) => {
    const seed = await readSeed()
    await page.goto(seed.spareInvite.url)

    // Step 1 — Your account
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
    await page.getByLabel('Full name').fill('E2E Test Owner')
    await page.getByLabel('Email').fill(`e2e-signup-${Date.now()}@wolfchow.test`)
    await page.getByLabel('Password', { exact: true }).fill('E2e-signup-pass-1!')
    await page.getByLabel('Confirm password').fill('E2e-signup-pass-1!')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2 — Your restaurant
    await expect(page.getByRole('heading', { name: 'Your restaurant' })).toBeVisible()
    await page.getByLabel('Business name').fill(`E2E Signup Restaurant ${Date.now()}`)
    await page.getByLabel('City').fill('New York')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 — Profile (optional)
    await expect(page.getByRole('heading', { name: 'Profile (optional)' })).toBeVisible()
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL('http://localhost:5174/')
  })
})
