import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'
import { fillStripeTestCard } from '../fixtures/stripe'

const STRIPE_SECRET_KEY = process.env.E2E_STRIPE_TEST_SECRET_KEY
const STRIPE_PUBLISHABLE_KEY = process.env.E2E_STRIPE_TEST_PUBLISHABLE_KEY

/**
 * Gated behind real Stripe test-mode credentials (same as E2E-03 — a refund
 * needs a real captured card payment to reverse). UNVERIFIED against a live
 * Stripe account. Places its own card order rather than depending on E2E-03
 * having run first, per the "every scenario independently runnable" rule.
 */
test.describe('E2E-08 · admin issues refund → Stripe test mode confirms', () => {
  test.skip(!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY, 'Requires E2E_STRIPE_TEST_SECRET_KEY and E2E_STRIPE_TEST_PUBLISHABLE_KEY env vars')
  test.setTimeout(120_000)

  test('refund from transactions page', async ({ browser }) => {
    const seed = await readSeed()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)

    // --- Configure Stripe + enable card payment ---
    await adminPage.goto('/payments')
    await adminPage.getByLabel('Stripe secret key').fill(STRIPE_SECRET_KEY!)
    await adminPage.getByLabel('Stripe publishable key').fill(STRIPE_PUBLISHABLE_KEY!)
    await adminPage.getByRole('button', { name: /Save & Verify/ }).click()
    await expect(adminPage.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
    await adminPage.getByLabel('Card payment method').check()

    // --- Place a fresh card order via the widget (this test's own fixture,
    // not shared with E2E-03) ---
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(seed.mainRestaurant.seededItemName)).toBeVisible({ timeout: 10_000 })
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'View Cart' }).click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Refund Customer')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-refund@wolfchow.test')
    await widgetPage.getByText('💳 Pay by Card').click()
    await fillStripeTestCard(widgetPage)
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()
    await expect(widgetPage.getByText('Order Placed!')).toBeVisible({ timeout: 20_000 })
    await widgetContext.close()

    // --- Refund it from Transactions ---
    await adminPage.goto('/transactions')
    const firstRow = adminPage.getByRole('row', { name: /^Transaction/ }).first()
    await firstRow.click()
    await expect(adminPage.getByRole('dialog', { name: 'Transaction detail' })).toBeVisible({ timeout: 10_000 })
    await adminPage.getByRole('button', { name: 'Issue refund' }).click()
    await expect(adminPage.getByRole('dialog', { name: 'Refund order' })).toBeVisible()
    await adminPage.getByRole('button', { name: 'Confirm refund' }).click()
    await expect(adminPage.getByText('This order has been refunded')).toBeVisible({ timeout: 15_000 })

    await adminContext.close()
  })
})
