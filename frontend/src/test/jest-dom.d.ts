// Types the jest-dom matchers (toBeInTheDocument and the rest) on Vitest's
// expect. Vitest 5 gives each assertion two type parameters and takes added
// matchers through its Matchers interface; jest-dom's own declaration still
// extends a one-parameter Assertion, which no longer merges, so every matcher
// was missing from the types. src/test/jestDomTypes.test.ts checks this.
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  // The parameters must match Vitest's declaration of Matchers to merge with it.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an empty body is how a declaration merge adds the jest-dom matchers
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, _T = unknown>
    extends TestingLibraryMatchers<unknown, R> {}
}
