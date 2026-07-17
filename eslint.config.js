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
      // Codebase convention: prefix an intentionally-unused binding with `_`
      // (e.g. a destructured field kept for documentation, a callback param
      // required by a signature but not read).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
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
