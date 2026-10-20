// ESLint for the backend.
//
// The backend had no linting at all until the no-`any` work: no config, no
// script, no dependencies. Its explicit `any` usages were never checked by
// anything, which is half of how a "strictly typed" project accumulated 326 of
// them across both projects.
//
// `@typescript-eslint/no-explicit-any` is an **error** here, and it applies to
// every file, tests included. There is no allowlist; do not add one.
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
  // Only TypeScript is linted, as before the flat config format; the
  // JavaScript here is configuration.
  { ignores: ['dist/', 'coverage/', '**/*.js', '**/*.cjs', '**/*.mjs'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

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

      // triple-slash-reference, prefer-const and no-useless-escape are on, as
      // the recommended sets have them. The session type augmentation in
      // types/express.d.ts is brought in with `import type`.
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
