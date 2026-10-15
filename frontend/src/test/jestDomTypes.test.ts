// The jest-dom matchers are typed on Vitest's expect (src/test/jest-dom.d.ts),
// and a matcher that does not exist is still a type error. `npm run
// typecheck` fails on the first expect below if the matchers lose their
// types, and on the @ts-expect-error if every name became acceptable.
import { describe, it, expect } from 'vitest';

describe('the jest-dom matcher types', () => {
  it('type the jest-dom matchers and refuse a misspelt one', () => {
    const element = document.createElement('p');
    element.textContent = 'Roll for initiative';
    document.body.append(element);

    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('initiative');
    expect(element).not.toBeEmptyDOMElement();
    expect({ node: element }).toEqual({ node: expect.anything() });
    // @ts-expect-error toBeInTheDocumen is not a matcher
    expect(() => expect(element).toBeInTheDocumen()).toThrow();

    element.remove();
  });
});
