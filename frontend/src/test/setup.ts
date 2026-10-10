// Extend Vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// findBy* and waitFor give up after one second by default. On a loaded machine
// or a small CI runner a mocked request and the re-render after it can take
// longer, so a correct test fails at random. Three seconds only raises the
// ceiling: a passing test still finishes as soon as its condition holds.
configure({ asyncUtilTimeout: 3000 });
