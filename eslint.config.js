import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '.wrangler',
      'dist',
      'coverage',
      'worker-configuration.d.ts',
      // The frontend monorepo is a separate pnpm workspace with its own
      // lint/typecheck/test pipeline (see web/). Don't lint it from the backend.
      'web',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Non-negotiable per project rules: never use `any`.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Integration tests and CLI scripts run in Node and use node globals.
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'vitest.integration.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
  },
)
