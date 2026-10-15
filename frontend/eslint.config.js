// ESLint baseline for the frontend. Restored after the config file had been
// lost: the lint script existed, but nothing was ever linted. Rules below are
// calibrated so `npm run lint` passes (--max-warnings 0) on the current
// codebase and can be ratcheted stricter over time; rules that would need a
// codebase-wide cleanup first are noted.
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { builtinRules } from 'eslint/use-at-your-own-risk';

// ESLint's recommended rules, what `eslint:recommended` named before the flat
// config format. Each built-in rule says whether it is recommended, and this
// reads that from ESLint itself; the same list is published as the
// @eslint/js package, which the project does not otherwise need.
const eslintRecommended = Object.fromEntries(
  [...builtinRules]
    .filter(([, rule]) => rule.meta?.docs?.recommended)
    .map(([name]) => [name, 'error'])
);

export default [
  // Only TypeScript is linted, as before the flat config format; the
  // JavaScript here is configuration.
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', 'vite.config.ts', '**/*.js', '**/*.cjs', '**/*.mjs'] },

  { name: 'eslint/recommended', rules: eslintRecommended },
  ...tsPlugin.configs['flat/recommended'],
  reactHooks.configs.flat.recommended,

  {
    name: 'cozyvtt/frontend',
    plugins: { 'react-refresh': reactRefresh.plugin },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // TODO(ratchet): several files export hooks/helpers alongside components;
      // splitting them is later cleanup. rules-of-hooks (error) still applies.
      'react-refresh/only-export-components': 'off',

      // TODO(ratchet): ~40 pre-existing violations. Fixing exhaustive-deps
      // changes runtime behavior (effects re-firing), so each needs individual
      // review before the rule is turned on.
      'react-hooks/exhaustive-deps': 'off',

      // Strict typing is a project requirement. This rule sat at 'off' behind a
      // deferred TODO while 326 explicit `any` accumulated across both projects —
      // the tsconfig's `noImplicitAny` never caught them, because an explicit
      // annotation is exactly how you opt out of inference. It is an error now,
      // everywhere: the allowlist of legacy files is empty and gone, so a new
      // `any`, in a test or not, fails lint.
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused vars are caught by tsc (noUnusedLocals); allow _-prefixed
      // intentional ignores to match existing style.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // TODO(ratchet): four of the React Compiler rules that came with
      // eslint-plugin-react-hooks 7, off for the reason exhaustive-deps is.
      // They ask for code the React Compiler can rewrite, and CozyVTT does
      // not use the compiler. They find 121 places on React 19
      // (set-state-in-effect 85, refs 26, immutability 5,
      // preserve-manual-memoization 5), and each fix changes when an effect
      // or a render runs, so each needs its own review. They come on one at a
      // time, each in its own branch: immutability and
      // preserve-manual-memoization first, then refs, moving the refs that
      // only carry the latest value into an effect to useEffectEvent, then
      // set-state-in-effect.
      // The plugin's other recommended rules, rules-of-hooks among them, are on.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },

  {
    name: 'cozyvtt/frontend-tests',
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      // A test's probe component hands what a hook returned to the test by
      // assigning it to a variable outside the component.
      'react-hooks/globals': 'off',
    },
  },
];
