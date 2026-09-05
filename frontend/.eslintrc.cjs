// ESLint baseline for the frontend. Restored in modernization Phase 3 —
// the lint script existed but the config file had been lost, so nothing
// was ever linted. Rules below are calibrated so `npm run lint` passes
// (--max-warnings 0) on the current codebase and can be ratcheted stricter
// over time; rules that would need a codebase-wide cleanup first are noted.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'coverage', '.eslintrc.cjs', 'vite.config.ts'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // TODO(ratchet): several files export hooks/helpers alongside components;
    // splitting them is Phase 5+ cleanup. rules-of-hooks (error) still applies.
    'react-refresh/only-export-components': 'off',

    // TODO(ratchet): ~40 pre-existing violations. Fixing exhaustive-deps
    // changes runtime behavior (effects re-firing), so each needs individual
    // review — planned alongside the state-layer migration (Phase 5).
    'react-hooks/exhaustive-deps': 'off',

    // Strict typing is a project requirement. This rule sat at 'off' behind a
    // deferred TODO while 326 explicit `any` accumulated across both projects —
    // the tsconfig's `noImplicitAny` never caught them, because an explicit
    // annotation is exactly how you opt out of inference. It is an error now;
    // the `overrides` block at the bottom is the shrinking list of files that
    // still hold the legacy usages.
    '@typescript-eslint/no-explicit-any': 'error',

    // Unused vars are caught by tsc (noUnusedLocals); allow _-prefixed
    // intentional ignores to match existing style.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  overrides: [
    {
      // Legacy `any`, being burned down cluster by cluster. Entries come off as
      // each file is converted; when this list is empty the block goes with it.
      // Do not add to it — a new file with `any` should fail lint.
      files: [
      'src/hooks/__tests__/useInitiativeSync.test.tsx',
      ],
      rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};
