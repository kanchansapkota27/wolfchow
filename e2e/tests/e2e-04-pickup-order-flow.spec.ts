import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff, loginTabletDevice } from '../fixtures/auth'
import { waitForIncomingOrder } from '../fixtures/tablet'

test.describe('E2E-04 · pickup order: no Stripe, straight to accepted → completed', () => {
  test('full flow', async ({ browser }) => {
    // This scenario spans 3 apps + a device-provisioning round trip + a
    // reload-polling wait for the realtime-less tablet connection (see
    // fixtures/tablet.ts) — measured up to ~2.5 minutes end-to-end in this
    // dev environment. The default 30s test timeout isn't enough.
    test.setTimeout(180_000)
    const seed = await readSeed()

    // --- Admin: provision a tablet device token ---
    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/devices')
    await adminPage.getByRole('button', { name: '+ Add Device' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Register Device' })).toBeVisible()
    await adminPage.getByRole('textbox').fill(`E2E Tablet Pickup ${Date.now()}`)
    await adminPage.getByRole('button', { name: 'Create Device' }).click()
    await expect(adminPage.getByRole('heading', { name: /Device token/ })).toBeVisible({ timeout: 10_000 })
    const deviceToken = await adminPage.getByText(/^dt_[a-f0-9]+$/).textContent()
    await adminPage.getByRole('button', { name: "Done — I've saved the token" }).click()
    await adminContext.close()
    if (!deviceToken) throw new Error('failed to capture device token')

    // --- Tablet: log in with the device token ---
    // Wide viewport — OrderQueue's 3-column kanban board (INCOMING/PREPARING/
    // READY) doesn't fit iPad Pro 12.9's 1366px landscape width without
    // horizontal scroll, which left ACCEPT "outside the viewport" even after
    // Playwright's auto-scroll attempts (confirmed interactively).
    const tabletContext = await browser.newContext({
      baseURL: 'http://localhost:5175',
      viewport: { width: 1920, height: 1080 },
    })
    const tabletPage = await tabletContext.newPage()
    await loginTabletDevice(tabletPage, deviceToken.trim())

    // --- Widget: place a pickup order ---
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(seed.mainRestaurant.seededItemName)).toBeVisible({ timeout: 10_000 })
    await widgetPage.getByRole('button', { name: '+ Add' }).first().click()
    await widgetPage.getByRole('button', { name: 'View Cart' }).click()
    await widgetPage.getByRole('button', { name: 'Continue to Checkout' }).click()
    await widgetPage.getByPlaceholder('Name *').fill('E2E Pickup Customer')
    await widgetPage.getByPlaceholder('Email *').fill('e2e-pickup@wolfchow.test')
    await widgetPage.getByText('🥡 Pay on Pickup').click()
    await widgetPage.getByRole('button', { name: /^Place Order/ }).click()
    await expect(widgetPage.getByText('Order Placed!')).toBeVisible({ timeout: 15_000 })
    await widgetContext.close()

    // --- Tablet: accept straight through to completed (no Stripe round-trip) ---
    // Confirmed interactively: accepting moves the order directly to
    // "preparing" (button already reads READY FOR PICKUP) — there's no
    // separate "accepted" state requiring a manual START PREPARING click
    // for this order type, unlike what the plan's research assumed.
    const acceptButton = tabletPage.getByRole('button', { name: 'ACCEPT' })
    await waitForIncomingOrder(tabletPage, acceptButton)
    await expect(acceptButton).toBeVisible({ timeout: 5_000 })
    await acceptButton.click()
    await expect(tabletPage.getByRole('button', { name: 'READY FOR PICKUP' })).toBeVisible({ timeout: 10_000 })
    await tabletPage.getByRole('button', { name: 'READY FOR PICKUP' }).click()
    await expect(tabletPage.getByRole('button', { name: 'COMPLETE ORDER' })).toBeVisible({ timeout: 10_000 })
    await tabletPage.getByRole('button', { name: 'COMPLETE ORDER' }).click()

    await tabletContext.close()
  })
})
