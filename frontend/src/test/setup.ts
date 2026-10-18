// Extend Vitest's expect with the jest-dom matchers (toBeInTheDocument and
// the rest). This entry also types them on Vitest's expect; the package's
// main entry types them only for Jest. jestDomTypes.test.ts checks it.
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// findBy* and waitFor give up after one second by default. On a loaded machine
// or a small CI runner a mocked request and the re-render after it can take
// longer, so a correct test fails at random. Three seconds only raises the
// ceiling: a passing test still finishes as soon as its condition holds.
configure({ asyncUtilTimeout: 3000 });
