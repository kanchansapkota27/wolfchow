# STORY-080: Playwright E2E (critical paths) — scoped to current implementation

**Date:** 2026-07-14
**Slice:** 5 — Hardening
**Vikunja:** TBD (Vikunja unreachable at design time — see Risks)
**Branch:** `feature/STORY-080-playwright-e2e`

## Summary

`sample-plan.md` (STORY-080) specifies a Playwright E2E suite covering 10 critical-path scenarios across all 5 frontend apps + backend, intended to run once every prior slice is complete. As of this story, Slice 4 (Widget + Public) is not fully merged — origin/main's highest merged story is STORY-075; STORY-076–078 (widget real-time public sync) are not yet in. This story implements the Playwright infrastructure per STORY-080's skeleton and **9 of the 10 scenarios** — every one whose underlying feature is confirmed present in the current codebase — and explicitly skips E2E-07 (real-time out-of-stock sync) with a `test.fixme()` documenting why, rather than faking it.

## Non-goals

- E2E-07 (kitchen marks item out of stock → widget shows Unavailable within 3s): the widget has zero realtime subscription code (`grep -rln "realtime|channel|subscribe" web/apps/widget/src` returns nothing) — this depends on unmerged Slice 4 work. Written as `test.fixme('E2E-07: ...', ...)` with a comment pointing at the missing capability, not implemented.
- No changes to application code — this is test infrastructure only.
- No CI wiring (GitHub Actions workflow) in this story — out of scope until asked for; running locally via `npx playwright test` is the deliverable. (STORY-080's "Infrastructure" section mentions Mailhog/CI, but standing up CI is a separate, larger task — flagged as a fast-follow, not blocking this story.)
- Pen testing and the Slice 5 exit gate ("all 10 E2E green") are explicitly NOT claimed by this story — 1 of 10 is deliberately not implemented.

## Confirmed-implemented scenarios (verified against current code before writing this spec)

| # | Scenario | Evidence it's implemented |
|---|---|---|
| E2E-01 | Signup via invite → 3-step form → admin dashboard | STORY-051–055 (invite flow) merged; superadmin invite creation + admin signup form present |
| E2E-02 | Admin creates category+item+modifier → appears in widget | STORY-058 (menu management) merged; widget `Menu.tsx` renders `PublicMenuCategory[]` from the public menu endpoint |
| E2E-03 | Card order → tablet accepts → tracking page progresses through statuses | STORY-068–073 (tablet Stripe capture) + STORY-074 (widget checkout) + STORY-075 (tracking app) all merged |
| E2E-04 | Pickup order → tablet accepts → completed, no Stripe | Same dependencies as E2E-03, pickup path confirmed in `widget/src/components/Checkout.tsx` (`payment_method` branching) |
| E2E-05 | Admin pauses → widget shows pause banner → unpause → checkout re-enabled | Confirmed: `widget/src/App.tsx:206-326` reads `settings.orders_paused`/`pause_reason` and disables checkout |
| E2E-06 | Admin creates promo → customer applies → discount applied | Confirmed: promo referenced in `widget/src/api.ts`, `Checkout.tsx`, `types.ts` (`validatePromo`, `PromoValidation`) |
| E2E-08 | Admin issues refund → Stripe test mode confirms | SEC-001 fixed the refund route (merged); admin Transactions page has refund action |
| E2E-09 | Superadmin suspends restaurant → admin login shows "Account suspended" | STORY-008 (superadmin restaurant management) merged |
| E2E-10 | Staff invited → tablet login → accepts order → permissions verified | NEW-B (impersonation/roles) + kitchen role tablet/admin access merged |

## Infrastructure

**Location:** new top-level `wolfchow/e2e/` directory (sibling to `src/` and `web/`) — own `package.json`, `playwright.config.ts`, `tests/`, `fixtures/`. Not part of the `web/` pnpm workspace (it drives both the backend Worker and the frontend apps, doesn't belong inside either).

**`playwright.config.ts` projects** (STORY-080's skeleton, expanded — the original only listed 3, but E2E-09 needs superadmin and E2E-03/04's tracking-page assertions need the tracking app):

```ts
projects: [
  { name: 'admin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' } },
  { name: 'superadmin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' } },
  { name: 'tablet-ipad', use: { ...devices['iPad Pro 12.9'], baseURL: 'http://localhost:5175' } },
  { name: 'widget-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5176' } },
  { name: 'tracking-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5177' } },
]
```

Ports confirmed from each app's `vite.config.ts`: superadmin 5173, admin 5174, tablet 5175, widget 5176, tracking 5177. Backend Worker: 8789 (`wrangler.toml`'s `[dev]` block).

**`webServer`**: Playwright's `webServer` array auto-starts `wrangler dev` + all 5 `vite dev` servers, each with `reuseExistingServer: !process.env.CI` so local runs attach to servers you already have up instead of relaunching.

**Precondition (documented in `e2e/README.md`, not automated):** local Supabase must already be running (`supabase start`) before running the suite — Playwright doesn't manage the Postgres/Auth stack.

**Seeding:** a Playwright `globalSetup` (`e2e/global-setup.ts`) creates a fresh test restaurant, plan, and superadmin-generated invite per run via the Supabase service-role client (same credentials pattern as `scripts/seed-superadmin.ts`), writing the created IDs/invite URL to a JSON file under `e2e/.tmp/` that test fixtures read from — so tests don't collide with real dev-seeded data (`supabase/seed.sql`) or with each other across parallel workers. `globalTeardown` deletes the created rows.

**Stripe:** test-mode publishable/secret keys read from `.dev.vars` (already present for local dev per Slice 3). Card `4242 4242 4242 4242`, `4242 4242 4242 4241`0 exp, any future date, any CVC — standard Playwright `fill()` into the Stripe Elements iframe (`frameLocator`).

**Email capture:** STORY-080's infra note mentions Mailhog for CI; for local runs, the existing `SmtpService`/`NotificationService` local dev config (check `src/services/smtp.ts` at implementation time) is used as-is — if there's no local Mailhog/inbucket already wired into `supabase start`'s stack, email-content assertions are skipped in favor of asserting the app's own success-state UI (e.g. "invite sent" toast) rather than blocking this story on standing up a new mail-capture service.

## Test file structure

One spec file per scenario, matching STORY-080's numbering, under `e2e/tests/`:

```
e2e/tests/
  e2e-01-signup-invite.spec.ts
  e2e-02-menu-management.spec.ts
  e2e-03-card-order-flow.spec.ts
  e2e-04-pickup-order-flow.spec.ts
  e2e-05-pause-resume.spec.ts
  e2e-06-promo-code.spec.ts
  e2e-07-realtime-availability.spec.ts   (test.fixme, not implemented)
  e2e-08-refund.spec.ts
  e2e-09-suspend-restaurant.spec.ts
  e2e-10-staff-tablet-permissions.spec.ts
```

Shared helpers in `e2e/fixtures/`: a `seededRestaurant` fixture (reads the globalSetup output), a `loginAs(page, role)` helper per app, and a `stripeCardFrame(page)` helper for filling the Stripe Elements iframe.

## Testing

This IS the test suite — no meta-tests. Acceptance: `npx playwright test` (from `e2e/`) runs all 10 spec files, 9 pass, 1 (`e2e-07`) reports `fixme` (not counted as a failure by Playwright's reporter).

## Risks / open questions

- Vikunja (self-hosted, `192.168.1.159:8081`) was unreachable at design time. Per user direction, proceeding without a Vikunja task now; will create/backfill it (and the branch-name comment) once reachable, before this story is marked complete per CLAUDE.md.
- Email capture approach (Mailhog vs. asserting UI state only) needs a final check against whatever `supabase start`'s local stack actually provides — resolved at implementation time in Task order below, not blocking this spec.
