import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-05 · admin pauses → widget shows banner → unpause re-enables checkout', () => {
  test('full flow', async ({ browser }) => {
    const seed = await readSeed()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/orders')
    await expect(adminPage.getByText('Orders are Flowing')).toBeVisible()
    await adminPage.getByRole('button', { name: 'Pause System' }).click()
    await adminPage.getByRole('button', { name: 'Manual' }).click()
    await expect(adminPage.getByText('Orders paused')).toBeVisible({ timeout: 10_000 })

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText('Orders are currently paused')).toBeVisible({ timeout: 10_000 })

    await adminPage.getByRole('button', { name: 'Resume' }).click()
    await expect(adminPage.getByText('Orders are Flowing')).toBeVisible({ timeout: 10_000 })

    // Widget has no realtime sync (confirmed during E2E-07 scoping) — reload
    // to pick up the unpause rather than assuming a live push.
    await widgetPage.reload()
    await expect(widgetPage.getByText('Orders are currently paused')).not.toBeVisible({ timeout: 10_000 })

    await adminContext.close()
    await widgetContext.close()
  })
})
