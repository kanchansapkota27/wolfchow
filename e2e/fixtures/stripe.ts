import type { Page } from '@playwright/test'

/**
 * Fills Stripe's test card into the widget checkout's Card Details section.
 * The widget mounts Stripe Elements into a dynamically-created light-DOM div
 * appended to document.body (outside the widget's shadow root) — there is no
 * stable container selector, so this locates Stripe's own iframe directly.
 */
export async function fillStripeTestCard(page: Page): Promise<void> {
  const stripeFrame = page.frameLocator('iframe[title="Secure card payment input frame"]')
  await stripeFrame.locator('[name="cardnumber"]').fill('4242424242424242')
  await stripeFrame.locator('[name="exp-date"]').fill('12/34')
  await stripeFrame.locator('[name="cvc"]').fill('123')
  await stripeFrame.locator('[name="postal"]').fill('10001')
}
