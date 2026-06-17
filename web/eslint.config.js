import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: ['node_modules', '**/dist', 'coverage', '**/*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Non-negotiable per project rules: never use `any`.
      '@typescript-eslint/no-explicit-any': 'error',
      // Allow intentionally-unused args/vars when prefixed with underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Browser/DOM globals are resolved by TypeScript (DOM lib), so leave
    // undefined-identifier checking to the compiler rather than enumerating
    // every global here — the standard typescript-eslint recommendation.
    files: ['packages/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
    },
  },
)
