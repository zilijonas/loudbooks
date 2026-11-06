import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', '**/playwright-report/**', '**/test-results/**', 'design/**', '.worktrees/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['apps/web/src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser }, plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  { files: ['apps/web/tests/**', 'apps/web/e2e/**', '**/*.config.{ts,js}'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  { files: ['apps/signaling/**/*.ts'], languageOptions: { globals: globals.serviceworker } },
)
