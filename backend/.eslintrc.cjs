// ESLint for the backend.
//
// The backend had no linting at all until the no-`any` work: no config, no
// script, no dependencies. Its explicit `any` usages were never checked by
// anything, which is half of how a "strictly typed" project accumulated 326 of
// them across both projects.
//
// `@typescript-eslint/no-explicit-any` is an **error** here. The `overrides`
// block at the bottom is a shrinking allowlist of files that still carry the
// legacy usages — new files, and any file cleaned up, are held to the rule.
// Entries come off the list as each cluster is converted; when the list is
// empty the block goes with it. Do not add to it.
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
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

    // TODO(ratchet): `require` appears in a few scripts and config shims.
    '@typescript-eslint/no-var-requires': 'off',

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
  overrides: [
    {
      // Legacy `any`. Shrinking — see the note at the top of this file.
      files: [
      'src/__tests__/helpers/websocket-test-server.ts',
      'src/middleware/auth.test.ts',
      'src/middleware/passwordChange.test.ts',
      'src/routes/__tests__/auth.e2e.test.ts',
      'src/routes/__tests__/game-systems.e2e.test.ts',
      'src/validators/__tests__/userPreferences.test.ts',
      'src/validators/game-systems/__tests__/validation.test.ts',
      'src/websocket/__tests__/events.integration.test.ts',
      ],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
