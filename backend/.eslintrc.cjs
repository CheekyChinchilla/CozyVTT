// ESLint for the backend.
//
// The backend had no linting at all until the no-`any` work: no config, no
// script, no dependencies. Its explicit `any` usages were never checked by
// anything, which is half of how a "strictly typed" project accumulated 326 of
// them across both projects.
//
// `@typescript-eslint/no-explicit-any` is an **error** here, and it applies to
// every file, tests included. There is no allowlist; do not add one.
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
};
