# STORY-082: Frontend Modularity Refactor

**Date:** 2026-07-06
**Slice:** 5 — Hardening
**Vikunja:** TBD (created at implementation start)
**Branch:** `feature/STORY-082-frontend-modularity`

## Summary

`web/` (the pnpm monorepo containing `admin`, `superadmin`, `tablet`, `tracking`, `widget`) already deploys each app independently to its own Cloudflare Pages project with no cross-app imports — deployment isolation is solid. The gap is that apps don't consistently *consume* the shared `packages/*` surface: several pieces of logic are copy-pasted across files/apps instead of imported, several page files have grown to 800-1300 lines mixing multiple components, and three of the five apps (`tablet`, `widget`, `tracking`) do manual `useEffect` + local-state data fetching instead of TanStack Query, which `admin` and `superadmin` already use.

This story removes the duplication, splits the oversized files, and brings all five apps onto the same TanStack Query pattern for API calls — without changing any user-visible behavior and without weakening independent deployability.

## Non-goals

- No new features, no visual/UX changes.
- No change to the deploy setup (per-app `vite.config.ts`, `wrangler pages deploy --project-name=...` stays as-is).
- No changes to backend routes or contracts.
- Realtime-subscription `useEffect`s (WebSocket/channel listeners, click-outside handlers) are left alone — TanStack Query is for data fetching, not all `useEffect` usage.

## 1. Shared package extractions

| Duplicate | Currently in | Move to |
|---|---|---|
| `StripeKeyGuide` | `admin/src/pages/Payments.tsx:12`, `admin/src/pages/Settings.tsx:536` (verbatim) | `admin/src/components/StripeKeyGuide.tsx` (app-local; Stripe copy is admin-specific, not cross-app) |
| `formatPrice` (7 copies) | `widget/src/components/{Cart,Checkout,ItemModal,Menu,OrderTracking,Success}.tsx`, `admin/src/pages/Menu.tsx:43` | delete all local copies; import `formatCurrency` from `@wolfchow/utils` (also fixes the hardcoded `en-US` locale bug in `admin/Menu.tsx`) |
| `buildApiClient`/`ApiProvider`/`useApi` (byte-identical ×3) | `admin/src/lib/api.tsx`, `tablet/src/lib/api.tsx`, `superadmin/src/lib/api.tsx` | new `createApiContext()` factory exported from `packages/api-client`; each app's `lib/api.tsx` shrinks to a short instantiation (superadmin keeps its extra `ADMIN_URL` export locally) |
| local `Card` | `admin/src/pages/Settings.tsx:107` | delete; use `@wolfchow/ui`'s `Card` (already imported in the same file for `Button`) |

## 2. Oversized file splits

Route/page file stays as the entry point; extracted pieces move to sibling files in the **same app** (no new cross-app coupling):

- `admin/src/pages/Menu.tsx` (1270 lines) → extract `AvailabilityBadge`, `CategoryModal` to `admin/src/components/menu/`
- `admin/src/pages/Settings.tsx` (1249 lines) → extract `BrandColorsCard`, `LinkField` to `admin/src/components/settings/` (`StripeKeyGuide` extraction covered in §1)
- `widget/src/components/Checkout.tsx` (858 lines) → split payment-step and form-step into two components
- `admin/src/pages/Payments.tsx`, `superadmin/src/pages/Smtp.tsx`, `admin/src/pages/SmtpSettings.tsx`, `admin/src/pages/Hours.tsx`, `admin/src/pages/Devices.tsx` → lighter trims, extract obvious inline modal/card sub-components only

No behavior changes — pure structural move. Existing tests must pass with import-path updates only.

## 3. TanStack Query standardization

- Add `@tanstack/react-query` to `tablet`, `widget`, `tracking` `package.json`.
- `createApiContext()` (§1) also wires a shared `QueryClientProvider`, so all 5 apps get identical setup.
- Convert to `useQuery`/`useMutation`:
  - `tablet`: `src/lib/useOrders.ts` and its callers (`ActiveOrders`, `OrderQueue`, `OrderHistory`, `Inventory`, `PauseControl`)
  - `widget`: data fetches in `App.tsx`, `Checkout.tsx`, `ItemModal.tsx`
  - `tracking`: `App.tsx`'s manual 10s poll loop → `useQuery` with `refetchInterval: 10000`
- Explicitly **not** touched: `tablet/src/lib/realtime.tsx`, `tablet/src/components/EventBanners.tsx`, `tablet/src/components/Layout.tsx` (no data fetching — realtime channel handling / click-outside UI logic).
- This is the largest sub-task in the story: a behavior-preserving rewrite of data-fetching in 3 apps, not a mechanical move.

## 4. Testing

- All existing Vitest suites must remain green (`Button.test.tsx`, `Modal.test.tsx`, `client.test.ts`, per-app `App.test.tsx`).
- New unit test for `packages/api-client`'s `createApiContext()` (mirrors existing `client.test.ts` pattern).
- Tests touching converted data-fetch code (tablet/widget/tracking) are updated to mock `useQuery`/`useMutation` instead of asserting on raw `fetch`/`useEffect` behavior — no new integration tests required since this is a refactor, not new behavior.
- Acceptance: `pnpm -w test` and `pnpm -w typecheck` green across all apps and packages; each app's `pnpm build` succeeds independently.

## 5. Tracking (per CLAUDE.md)

- Vikunja: create STORY-082 under Slice 5 (Hardening — project 13), label `frontend`.
- Docmost: story page in Stories space using the standard template.
- Branch: `feature/STORY-082-frontend-modularity` off `main`.
- Commits, one per logical unit (not batched):
  1. `packages/api-client` `createApiContext()` factory + its test
  2. Dedupe `formatPrice`/`Card`/`StripeKeyGuide`, rewire `admin`/`tablet`/`superadmin`'s `lib/api.tsx` to the factory
  3. Split `admin/Menu.tsx`, `admin/Settings.tsx` into sub-components
  4. Split `widget/Checkout.tsx` and the remaining lighter-trim files
  5. TanStack Query conversion — `tablet`
  6. TanStack Query conversion — `widget`
  7. TanStack Query conversion — `tracking`
- Single PR at the end (user chose not to split into multiple PRs).

## Risks / open questions

- None blocking. If a converted app's test mocking turns out to need a shared test-utility (e.g. a `QueryClientProvider` test wrapper), add it to `packages/utils` or a test-only helper in that app — decide at implementation time, not a spec blocker.
