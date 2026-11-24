// TODO: switch to `verful()` from @verful/tooling-configs/oxc/fmt once 2.x is
// on npm. npm still serves 1.6.0 (the ESLint config), so this file mirrors it.
import { defineConfig } from 'oxfmt'

export default defineConfig({
  trailingComma: 'es5',
  semi: false,
  singleQuote: true,
  useTabs: false,
  quoteProps: 'consistent',
  bracketSpacing: true,
  arrowParens: 'always',
  printWidth: 100,
  sortPackageJson: true,
  // Mirrors the preset's perfectionist `sort-imports` groups
  sortImports: {
    type: 'line-length',
    order: 'asc',
    internalPattern: ['^@/.*', '^#.*/.*'],
    groups: [
      ['side_effect', 'side_effect_style'],
      ['builtin', 'external'],
      ['internal', 'subpath', 'parent', 'sibling', 'index', 'style', 'unknown'],
    ],
  },
  ignorePatterns: ['build', 'coverage', 'tmp', 'node_modules', 'pnpm-lock.yaml', 'CHANGELOG.md'],
})
