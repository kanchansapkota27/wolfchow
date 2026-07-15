# STORY-080 Playwright E2E

## Prerequisites (not automated by this suite)

1. Local Supabase running: `supabase start` (from repo root)
2. `.dev.vars` has `MFA_DEV_BYPASS="true"` (see `.dev.vars.example`) — required for superadmin login without TOTP
3. `.dev.vars` has valid `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `MASTER_ENCRYPTION_KEY`

## Running

```bash
cd e2e
pnpm install
pnpm test              # headless, all projects
pnpm test:headed       # visible browser
pnpm test:ui           # Playwright UI mode
npx playwright test e2e-05-pause-resume.spec.ts   # single scenario
```

Playwright auto-starts the backend Worker and all 5 frontend dev servers via `webServer` (reuses already-running ones). It does NOT start Supabase — start that yourself first.

## What's covered

9 of STORY-080's 10 scenarios. **E2E-07 (realtime out-of-stock sync) is a documented `test.fixme()`** — the widget has no realtime subscription code yet; see `tests/e2e-07-realtime-availability.spec.ts` for the tracking issue.

## Seeding

`global-setup.ts` provisions: a superadmin login, one plan, one ready-to-use "main" test restaurant + owner admin account + one always-available menu item (used by most scenarios), and one spare unused invite token (consumed only by E2E-01, which tests the actual signup-via-invite UI). `global-teardown.ts` deletes everything it created. Seed data written to `e2e/.tmp/seed.json` (gitignored) for fixtures to read.
