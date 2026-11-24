// TODO: switch to `verful()` from @verful/tooling-configs/oxc/lint once 2.x is
// on npm. npm still serves 1.6.0 (the ESLint config), so this file mirrors the
// preset's rules. Import sorting lives in oxfmt.config.ts.
import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'import', 'jsdoc', 'node'],
  env: { builtin: true },
  ignorePatterns: ['build', 'coverage', 'tmp', 'node_modules'],
  rules: {
    // JavaScript
    'prefer-const': 'error',
    'no-constant-condition': 'warn',
    'no-debugger': 'error',
    'no-cond-assign': ['error', 'always'],
    'no-array-constructor': 'error',
    'no-unreachable': 'error',
    'one-var': ['error', 'never'],
    'eqeqeq': ['error', 'always'],
    'no-caller': 'error',
    'no-control-regex': 'error',
    'no-duplicate-case': 'error',
    'no-eval': 'error',
    'no-ex-assign': 'error',
    'no-extra-boolean-cast': 'error',
    'no-fallthrough': 'error',
    'no-inner-declarations': 'error',
    'no-invalid-regexp': ['error', { allowConstructorFlags: ['u', 'y'] }],
    'no-proto': 'error',
    'no-regex-spaces': 'error',
    'no-self-compare': 'error',
    'no-sparse-arrays': 'error',
    'object-shorthand': ['error', 'always', { avoidQuotes: true, ignoreConstructors: false }],
    'no-unsafe-negation': 'error',
    'no-new-wrappers': 'error',
    'no-self-assign': 'error',
    'no-this-before-super': 'error',
    'no-else-return': 'error',
    'no-with': 'error',
    'no-unsafe-finally': 'error',
    'use-isnan': 'error',
    'valid-typeof': ['error', { requireStringLiterals: true }],
    'curly': ['error', 'all'],
    'yoda': 'error',
    'no-nested-ternary': 'error',
    'capitalized-comments': [
      'error',
      'always',
      {
        line: {
          ignorePattern: '.*',
          ignoreInlineComments: true,
          ignoreConsecutiveComments: true,
        },
      },
    ],

    // Imports
    'import/first': 'error',
    'import/no-mutable-exports': 'error',
    'import/no-duplicates': 'error',
    'import/no-named-default': 'error',
    'import/no-self-import': 'error',
    'import/newline-after-import': 'error',

    // JSDoc
    'jsdoc/check-access': 'warn',
    'jsdoc/check-property-names': 'warn',
    'jsdoc/empty-tags': 'warn',
    'jsdoc/implements-on-classes': 'warn',
    'jsdoc/no-defaults': 'warn',
    'jsdoc/require-param-name': 'warn',
    'jsdoc/require-property': 'warn',
    'jsdoc/require-property-description': 'warn',
    'jsdoc/require-property-name': 'warn',
    'jsdoc/require-returns-description': 'warn',

    // Node
    'node/handle-callback-err': ['error', '^(err|error)$'],
    'node/no-exports-assign': 'error',
    'node/no-new-require': 'error',
    'node/no-path-concat': 'error',

    // Unicorn
    'unicorn/filename-case': ['error', { case: 'snakeCase' }],
    'unicorn/no-null': 'off',
    'unicorn/no-array-reduce': 'off',

    // TypeScript
    'typescript/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', disallowTypeAnnotations: false },
    ],
    'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
    'typescript/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
    'typescript/prefer-ts-expect-error': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-redeclare': 'error',
    'no-dupe-class-members': 'error',
    'no-loss-of-precision': 'error',
    'typescript/consistent-type-definitions': 'off',
    'typescript/consistent-indexed-object-style': 'off',
    'typescript/explicit-function-return-type': 'off',
    'typescript/no-explicit-any': 'off',
    'typescript/parameter-properties': 'off',
    'typescript/no-empty-interface': 'off',
    'typescript/no-empty-function': 'off',
    'typescript/no-non-null-assertion': 'off',
    'typescript/explicit-module-boundary-types': 'off',
    'typescript/no-namespace': 'off',
    'typescript/triple-slash-reference': 'off',
  },
  overrides: [
    {
      files: ['**/*.{ts,mts,cts,tsx}'],
      rules: {
        'typescript/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      },
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx}'],
      rules: {
        'typescript/ban-ts-comment': 'off',
        'typescript/prefer-ts-expect-error': 'off',
      },
    },
  ],
})
