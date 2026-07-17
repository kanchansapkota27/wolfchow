import { defineConfig } from 'vitest/config'

// Integration tests run in Node (not the Workers pool) because they talk to a
// live local Supabase over HTTP and sign JWTs with node:crypto.
// Bring the stack up first with `npx supabase start`.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
})
