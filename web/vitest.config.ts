import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Two test projects: package logic (types/utils/api-client) runs in a Node
 * environment; the React component library runs in jsdom with the React plugin
 * and jest-dom matchers. Workspace package imports (`@wolfchow/*`) resolve via
 * pnpm symlinks + each package's `exports`, so no path aliases are needed here.
 */
export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['packages/{types,utils,api-client}/src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          include: [
            'packages/{ui,auth,realtime,api-client}/src/**/*.test.tsx',
            'apps/*/src/**/*.test.tsx',
            'apps/*/src/**/*.test.ts',
          ],
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
