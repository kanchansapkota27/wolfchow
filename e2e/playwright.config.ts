import { defineConfig, devices } from '@playwright/test'

const BACKEND_URL = 'http://localhost:8789'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // shared main restaurant fixture — avoid cross-test races on its data
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --dir .. dev', // wrangler dev, from repo root
      url: `${BACKEND_URL}/health`, // root "/" 404s (no route); readiness check needs a 2xx
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-superadmin dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-admin dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-tablet dev',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-widget dev',
      url: 'http://localhost:5176',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --dir ../web --filter @wolfchow/app-tracking dev',
      url: 'http://localhost:5177',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: 'admin-desktop',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
      // Every scenario whose primary actor is the admin app, plus E2E-07's
      // fixme placeholder (project doesn't matter, it never runs) and E2E-08
      // (opens its own explicit contexts per app, admin is just where it starts).
      testMatch: [
        'e2e-01-signup-invite.spec.ts',
        'e2e-02-menu-management.spec.ts',
        'e2e-05-pause-resume.spec.ts',
        'e2e-06-promo-code.spec.ts',
        'e2e-07-realtime-availability.spec.ts',
        'e2e-08-refund.spec.ts',
      ],
    },
    {
      name: 'superadmin-desktop',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
      testMatch: ['e2e-09-suspend-restaurant.spec.ts'],
    },
    {
      name: 'widget-mobile',
      use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5176' },
      // Cross-app order-flow scenarios — widget is the primary actor; each
      // opens its own explicit admin/tablet/tracking contexts with their own
      // baseURLs, so only the widget-facing steps use this project's default.
      testMatch: [
        'e2e-03-card-order-flow.spec.ts',
        'e2e-04-pickup-order-flow.spec.ts',
        'e2e-10-tablet-permissions.spec.ts',
      ],
    },
    // No spec files currently target tablet-ipad or tracking-mobile directly
    // as their PRIMARY project (every tablet/tracking interaction happens via
    // an explicitly-created context inside a widget-mobile or admin-desktop
    // test) — kept registered for `--project` ad-hoc runs and future scenarios,
    // but excluded from a plain `npx playwright test` via an empty testMatch.
    {
      name: 'tablet-ipad',
      use: { ...devices['iPad Pro 12.9'], baseURL: 'http://localhost:5175' },
      testMatch: [],
    },
    {
      name: 'tracking-mobile',
      use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5177' },
      testMatch: [],
    },
  ],
})
