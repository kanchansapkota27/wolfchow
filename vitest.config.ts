import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
  ],
  test: {
    // Workers-runtime unit tests only. Integration tests that hit a live local
    // Supabase run under vitest.integration.config.ts (Node environment).
    include: ['src/**/*.test.ts'],
  },
})
