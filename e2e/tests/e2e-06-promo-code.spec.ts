import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-06 · admin creates promo → customer applies at checkout', () => {
  test('discount applied correctly', async ({ browser }) => {
    const seed = await readSeed()
    const promoCode = `E2E${Date.now()}`.slice(0, 20).toUpperCase()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/promotions')
    await adminPage.getByRole('button', { name: 'Create promotion' }).click()
    await expect(adminPage.getByRole('dialog', { name: 'Create promotion' })).toBeVisible()
    // "Title"/"Description" aren't wired via htmlFor (same pattern as the
    // Menu category/item modals) — Title is the first plain textbox in the
    // dialog. The rest of these fields do have real accessible names.
    await adminPage.getByRole('textbox').first().fill('E2E 10% off')
    await adminPage.getByRole('radio', { name: '% Off' }).check()
    await adminPage.getByRole('spinbutton', { name: 'Discount value' }).fill('10')
    await adminPage.getByRole('textbox', { name: 'Promo code' }).fill(promoCode)
    await adminPage.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(adminPage.getByText(promoCode)).toBeVisible({ timeout: 10_000 })
    await adminContext.close()

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(seed.mainRestaurant.seededItemName)).toBeVisible({ timeout: 10_000 })
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'View Cart' }).click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Enter code').fill(promoCode)
    await widgetPage.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(widgetPage.getByText(/off$/)).toBeVisible({ timeout: 10_000 })

    await widgetContext.close()
  })
})
