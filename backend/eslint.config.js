// ESLint for the backend.
//
// The backend had no linting at all until the no-`any` work: no config, no
// script, no dependencies. Its explicit `any` usages were never checked by
// anything, which is half of how a "strictly typed" project accumulated 326 of
// them across both projects.
//
// `@typescript-eslint/no-explicit-any` is an **error** here, and it applies to
// every file, tests included. There is no allowlist; do not add one.
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const { builtinRules } = require('eslint/use-at-your-own-risk');

// ESLint's recommended rules, what `eslint:recommended` named before the flat
// config format. Each built-in rule says whether it is recommended, and this
// reads that from ESLint itself; the same list is published as the
// @eslint/js package, which the project does not otherwise need.
const eslintRecommended = Object.fromEntries(
  [...builtinRules]
    .filter(([, rule]) => rule.meta?.docs?.recommended)
    .map(([name]) => [name, 'error'])
);

module.exports = [
  // Only TypeScript is linted, as before the flat config format; the
  // JavaScript here is configuration.
  { ignores: ['dist/', 'coverage/', '**/*.js', '**/*.cjs', '**/*.mjs'] },

  { name: 'eslint/recommended', rules: eslintRecommended },
  ...tsPlugin.configs['flat/recommended'],

  {
    name: 'cozyvtt/backend',
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // The reason this config exists.
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused vars are already caught by tsc's noUnusedLocals; allow the
      // _-prefixed intentional ignores the codebase uses. `ignoreRestSiblings`
      // permits the omit-by-destructuring pattern in services/auth.ts, where
      // `const { passwordHash, mfaSecret, ...safe } = user` is precisely how
      // sensitive fields are dropped before a user object is returned.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],

      // The three below are pre-existing violations unrelated to the `any` work
      // this config was added for. Each needs a code edit, and a code edit in a
      // lint-configuration commit would break the "emitted JavaScript is
      // unchanged" guarantee that makes this refactor provably safe. Left off
      // deliberately, to be ratcheted on their own:
      //   triple-slash-reference — one express type augmentation in routes/setup.ts
      //   prefer-const           — one `let` in utils/dice-parser.ts
      //   no-useless-escape      — two regex escapes in utils/validation.ts
      '@typescript-eslint/triple-slash-reference': 'off',
      'prefer-const': 'off',
      'no-useless-escape': 'off',
    },
  },

  {
    name: 'cozyvtt/backend-tests',
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      // A test that sets the environment, or a mock, and then loads a module
      // afresh (inside jest.isolateModules or after jest.resetModules) needs
      // the load to happen there and then, which only require() does.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
];
