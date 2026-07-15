import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'
import { waitForIncomingOrder } from '../fixtures/tablet'

/**
 * Reframed from the story's original "staff invited" wording: this codebase
 * provisions tablet/kitchen access entirely via device tokens with
 * per-permission checkboxes (Devices page), not a separate staff-invite
 * flow. This test verifies the backend actually enforces the
 * orders:accept_reject permission (confirmed present at
 * src/routes/tablet/orders.ts:62-63, tested in orders.test.ts) — the
 * frontend's NewOrderCard.handleAccept swallows the resulting 403 with no
 * error UI (confirmed reading OrderQueue.tsx), so a rejected accept is only
 * observable as the order staying in the INCOMING column instead of moving
 * to PREPARING.
 */
test.describe('E2E-10 · device permissions gate tablet actions', () => {
  // Same environment-slowness reality as E2E-04 (3 apps, device
  // provisioning, reload-polling on the realtime-less tablet connection) —
  // 120s wasn't enough on a slower run.
  test.setTimeout(180_000)

  test('device without accept/reject permission cannot accept orders', async ({ browser }) => {
    const seed = await readSeed()

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Register Device' })).toBeVisible()
    await adminPage.getByRole('textbox').fill(`E2E Limited Tablet ${Date.now()}`)
    // Default-checked permissions are orders:accept_reject and orders:status
    // — uncheck accept/reject so this device can only view, not act.
    await adminPage.getByLabel('Accept / Reject').uncheck()
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    await expect(adminPage.getByRole('heading', { name: /Device token/ })).toBeVisible({ timeout: 10_000 })
    const deviceToken = await adminPage.getByText(/^dt_[a-f0-9]+$/).textContent()
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()
    if (!deviceToken) throw new Error('failed to capture device token')

    const tabletContext = await browser.newContext({
      baseURL: 'http://localhost:5175',
      viewport: { width: 1920, height: 1080 },
    })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())

    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(seed.mainRestaurant.seededItemName)).toBeVisible({ timeout: 10_000 })
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'View Cart' }).click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Permission Test')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-permtest@wolfchow.test')
    await widgetPage.getByText('🥡 Pay on Pickup').click()
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()
    await expect(widgetPage.getByText('Order Placed!')).toBeVisible({ timeout: 15_000 })
    await widgetContext.close()

    const acceptButton = tabletPage.getByRole('button', { name: 'ACCEPT' })
    await waitForIncomingOrder(tabletPage, acceptButton)
    await expect(acceptButton).toBeVisible({ timeout: 5_000 })
    await acceptButton.click()

    // The mutation is rejected server-side (403) and the frontend swallows
    // the error silently — the only observable effect is that the order
    // never leaves the INCOMING column. Give it a moment, then assert it's
    // still there with ACCEPT still showing (not moved to PREPARING).
    await tabletPage.waitForTimeout(3_000)
    await expect(acceptButton).toBeVisible()
    await expect(tabletPage.getByRole('button', { name: 'READY FOR PICKUP' })).not.toBeVisible()

    await tabletContext.close()
  })
})
