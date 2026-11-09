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

// jsdom has no pointer capture, and MapCanvas asks for it on every touch and
// pen press. Stubbed once, on Element, so a test can spy on it;
// hasPointerCapture answers from what was asked.
if (typeof Element !== 'undefined' && !('setPointerCapture' in Element.prototype)) {
  const captured = new WeakMap<Element, Set<number>>();
  const idsOf = (el: Element) => {
    let ids = captured.get(el);
    if (!ids) captured.set(el, (ids = new Set()));
    return ids;
  };
  Object.defineProperties(Element.prototype, {
    setPointerCapture: { configurable: true, writable: true, value(this: Element, pointerId: number) { idsOf(this).add(pointerId); } },
    releasePointerCapture: { configurable: true, writable: true, value(this: Element, pointerId: number) { idsOf(this).delete(pointerId); } },
    hasPointerCapture: { configurable: true, writable: true, value(this: Element, pointerId: number) { return idsOf(this).has(pointerId); } },
  });
}

// jsdom has no scrolling methods. ChatPanel and the dice log scroll to their
// newest entry on a timer after loading, which can fire after a test has
// ended, and an error then fails the whole run on a slow runner. Stubbed
// once, on Element, so a test can still define or spy on its own.
if (typeof Element !== 'undefined' && !('scrollTo' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, writable: true, value() {} });
}
