import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

/**
 * Scoped down from the original STORY-080 scenario ("admin login shows
 * Account suspended") after finding a real bug: suspension has no backend
 * enforcement and the frontend's SuspendedPage is never wired into any
 * app's main.tsx. Tracked as Vikunja #79 / Docmost BUG Resolutions.
 * This test verifies what actually works today: the superadmin toggle
 * itself and its status badge.
 */
test.describe('E2E-09 · superadmin suspends/reactivates a restaurant', () => {
  test('status badge reflects suspend then reactivate', async ({ page }) => {
    const seed = await readSeed()

    await loginAsStaff(page, seed.superadmin.email, seed.superadmin.password)
    await page.goto('/restaurants')
    // Filter by slug — several leftover fixture restaurants can share the
    // same display name across runs, so a name-only locator isn't unique.
    await page.getByRole('textbox', { name: 'Search restaurants' }).fill(seed.mainRestaurant.slug)
    await expect(page.getByRole('cell', { name: 'E2E Main Restaurant' })).toHaveCount(1, { timeout: 5_000 })
    await page.getByText('E2E Main Restaurant').click()

    const detailPanel = page.getByLabel('Restaurant E2E Main Restaurant')
    await expect(detailPanel.getByText('Active', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Suspend', exact: true }).click()
    await page.getByRole('dialog', { name: 'Suspend restaurant' }).getByRole('button', { name: 'Suspend', exact: true }).click()
    await expect(detailPanel.getByText('Suspended')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Reactivate', exact: true }).click()
    await page.getByRole('dialog', { name: 'Reactivate restaurant' }).getByRole('button', { name: 'Reactivate', exact: true }).click()
    await expect(detailPanel.getByText('Active', { exact: true })).toBeVisible({ timeout: 10_000 })
  })
})
