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
    { name: 'admin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' } },
    { name: 'superadmin-desktop', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' } },
    { name: 'tablet-ipad', use: { ...devices['iPad Pro 12.9'], baseURL: 'http://localhost:5175' } },
    { name: 'widget-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5176' } },
    { name: 'tracking-mobile', use: { ...devices['iPhone 14'], baseURL: 'http://localhost:5177' } },
  ],
})
