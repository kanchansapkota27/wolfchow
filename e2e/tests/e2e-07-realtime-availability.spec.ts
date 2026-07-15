import { test } from '@playwright/test'

test.describe('E2E-07 · kitchen marks item out of stock → widget shows Unavailable within 3s', () => {
  test.fixme(
    true,
    'Not implemented: the widget (web/apps/widget/src) has no realtime subscription ' +
    'code at all (confirmed via grep for "realtime|channel|subscribe" — zero matches). ' +
    'This scenario depends on STORY-076-078 (Slice 4 widget real-time public sync), ' +
    'which are not yet merged to main. Revisit once those land — the tablet-side ' +
    'availability toggle (Inventory.tsx) already works; only the widget push side is missing.',
  )

  test('kitchen marks unavailable → widget reflects it live', async () => {
    // Intentionally empty — test.fixme() above prevents this from running.
  })
})
