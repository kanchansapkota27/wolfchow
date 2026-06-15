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
    // Integration tests run in Node and use node globals + config files.
    files: ['tests/**/*.ts', 'vitest.integration.config.ts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
      },
    },
  },
)
