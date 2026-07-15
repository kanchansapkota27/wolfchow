import type { Locator, Page } from '@playwright/test'

/**
 * Waits for a new order to appear on the tablet's Live Orders queue.
 *
 * The tablet's realtime connection shows "Offline" in this local dev/test
 * environment (confirmed interactively — the order never arrives via live
 * push within several seconds, but is present immediately on a manual
 * reload), so this polls via reload rather than assuming a realtime event
 * will arrive. The accept/prepare/ready/complete actions themselves are
 * plain REST calls and work regardless of the realtime connection state.
 */
export async function waitForIncomingOrder(page: Page, acceptButton: Locator, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await acceptButton.isVisible().catch(() => false)) return
    await page.reload()
    await page.waitForTimeout(1500)
  }
  // Final attempt — let the caller's own assertion produce the real error.
}
