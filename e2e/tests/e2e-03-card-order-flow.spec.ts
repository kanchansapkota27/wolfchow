import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'
import { fillStripeTestCard } from '../fixtures/stripe'
import { waitForIncomingOrder } from '../fixtures/tablet'

const STRIPE_SECRET_KEY = process.env.E2E_STRIPE_TEST_SECRET_KEY
const STRIPE_PUBLISHABLE_KEY = process.env.E2E_STRIPE_TEST_PUBLISHABLE_KEY

/**
 * Gated behind real Stripe test-mode credentials, which aren't available in
 * this environment (no Stripe keys anywhere in .dev.vars or vault config;
 * the key is entered per-restaurant via the admin Payments UI). Set both
 * E2E_STRIPE_TEST_SECRET_KEY (sk_test_...) and E2E_STRIPE_TEST_PUBLISHABLE_KEY
 * (pk_test_...) to run this for real. UNVERIFIED against a live Stripe
 * account — the structure follows E2E-04's proven pattern (device
 * provisioning, widget checkout, tablet accept/prepare/ready/complete,
 * tablet-realtime-is-offline reload-polling) but the Stripe-specific steps
 * (key configuration, card iframe fill) have not been run end-to-end.
 */
test.describe('E2E-03 · card order: widget → tablet accepts → tracking progresses', () => {
  test.skip(!STRIPE_SECRET_KEY || !STRIPE_PUBLISHABLE_KEY, 'Requires E2E_STRIPE_TEST_SECRET_KEY and E2E_STRIPE_TEST_PUBLISHABLE_KEY env vars')
  test.setTimeout(180_000)

  test('full flow', async ({ browser }) => {
    const seed = await readSeed()

    // --- Admin: configure Stripe test keys + enable card payment method ---
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/payments')
    await adminPage.getByLabel('Stripe secret key').fill(STRIPE_SECRET_KEY!)
    await adminPage.getByLabel('Stripe publishable key').fill(STRIPE_PUBLISHABLE_KEY!)
    await adminPage.getByRole('button', { name: /Save & Verify/ }).click()
    await expect(adminPage.getByText('Saved ✓')).toBeVisible({ timeout: 15_000 })
    await adminPage.getByLabel('Card payment method').check()

    // --- Admin: provision a tablet device token ---
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Register Device' })).toBeVisible()
    await adminPage.getByRole('textbox').fill(`E2E Tablet Card ${Date.now()}`)
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    await expect(adminPage.getByRole('heading', { name: /Device token/ })).toBeVisible({ timeout: 10_000 })
    const deviceToken = await adminPage.getByText(/^dt_[a-f0-9]+$/).textContent()
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()
    if (!deviceToken) throw new Error('failed to capture device token')

    // --- Tablet: log in with the device token ---
    const tabletContext = await browser.newContext({
      baseURL: 'http://localhost:5175',
      viewport: { width: 1920, height: 1080 },
    })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())

    // --- Widget: place a card order ---
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(seed.mainRestaurant.seededItemName)).toBeVisible({ timeout: 10_000 })
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'View Cart' }).click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Card Customer')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-card@wolfchow.test')
    await widgetPage.getByText('💳 Pay by Card').click()
    await fillStripeTestCard(widgetPage)
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()
    await expect(widgetPage.getByText('Order Placed!')).toBeVisible({ timeout: 20_000 })

    const trackingHref = await widgetPage.getByRole('link', { name: /track/i }).getAttribute('href')
    await widgetContext.close()
    if (!trackingHref) throw new Error('failed to capture tracking link from widget Success screen')

    // --- Tablet: accept → ready → complete ---
    const acceptButton = tabletPage.getByRole('button', { name: 'ACCEPT' })
    await waitForIncomingOrder(tabletPage, acceptButton)
    await expect(acceptButton).toBeVisible({ timeout: 5_000 })
    await acceptButton.click()

    const trackingContext = await browser.newContext({ baseURL: 'http://localhost:5177' })
    const trackingPage = await trackingContext.newPage()
    await trackingPage.goto(trackingHref)

    // Per E2E-04's finding, accept moves straight to "preparing" (no
    // separate manual "start preparing" step) — the tablet button should
    // already read READY FOR PICKUP once ACCEPT succeeds.
    await expect(tabletPage.getByRole('button', { name: 'READY FOR PICKUP' })).toBeVisible({ timeout: 10_000 })
    await expect(trackingPage.getByText('Being prepared')).toBeVisible({ timeout: 15_000 })
    await tabletPage.getByRole('button', { name: 'READY FOR PICKUP' }).click()
    await expect(trackingPage.getByText('Ready for pickup!')).toBeVisible({ timeout: 15_000 })

    await tabletContext.close()
    await trackingContext.close()
  })
})
