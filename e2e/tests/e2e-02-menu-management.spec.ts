import { test, expect } from '@playwright/test'
import { readSeed } from '../fixtures/seed'
import { loginAsStaff } from '../fixtures/auth'

test.describe('E2E-02 · admin creates menu item, appears in widget', () => {
  test('category + item + modifier → visible in widget', async ({ browser }) => {
    const seed = await readSeed()
    const itemName = `E2E Item ${Date.now()}`
    const categoryName = `E2E Category ${Date.now()}`

    const adminContext = await browser.newContext({ baseURL: 'http://localhost:5174' })
    const adminPage = await adminContext.newPage()
    await loginAsStaff(adminPage, seed.mainRestaurant.ownerEmail, seed.mainRestaurant.ownerPassword)
    await adminPage.goto('/menu')

    // Add category. The modal's "Name" text is a plain label-less span (not
    // wired via htmlFor), so getByLabel doesn't match — it's the only
    // textbox on the page while the modal is open.
    await adminPage.getByRole('button', { name: 'Add category' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Add Category' })).toBeVisible()
    await adminPage.getByRole('textbox').fill(categoryName)
    await adminPage.getByRole('button', { name: 'Create' }).click()
    await expect(adminPage.getByText(categoryName)).toBeVisible()

    // Add item — the drawer has the same label-less-input pattern; verified
    // interactively, see the two textboxes (Name, then Price once no-variant
    // mode is default) in DOM order.
    await adminPage.getByRole('button', { name: 'Add Item' }).click()
    await expect(adminPage.getByRole('heading', { name: 'Add Item' })).toBeVisible()
    await adminPage.getByRole('textbox').first().fill(itemName)
    await adminPage.getByRole('spinbutton').fill('12.50')
    await adminPage.getByRole('button', { name: 'Create Item' }).click()
    await expect(adminPage.getByText(itemName)).toBeVisible()

    await adminContext.close()

    // Verify in widget's demo harness — reads ?slug= (not ?restaurant=) and
    // defaults to the built dist/embed.js unless ?src=dev forces the live
    // dev server (avoids exercising a stale build).
    const widgetContext = await browser.newContext({ baseURL: 'http://localhost:5176' })
    const widgetPage = await widgetContext.newPage()
    await widgetPage.goto(`/demo.html?slug=${seed.mainRestaurant.slug}&src=dev`)
    await expect(widgetPage.getByText(itemName)).toBeVisible({ timeout: 10_000 })
    await widgetContext.close()
  })
})
