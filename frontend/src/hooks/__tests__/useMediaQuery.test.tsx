/**
 * useMediaQuery follows a media query once per component, not once per draw.
 *
 * Its subscription was made anew on every render, so React dropped the
 * listener and added a fresh one each time, asking the browser for a new
 * MediaQueryList as it did. The map asks it whether the pointer is a finger,
 * and the map draws on every move of the pointer and every frame of a drag.
 */

import { it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A matchMedia that counts what is asked of it, and can change its answer. */
function countingMatchMedia() {
  const listeners = new Set<() => void>();
  const counts = { lists: 0, added: 0, removed: 0 };
  let matches = false;
  vi.stubGlobal('matchMedia', (query: string) => {
    counts.lists += 1;
    return {
      get matches() { return matches; },
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: () => void) => { counts.added += 1; listeners.add(fn); },
      removeEventListener: (_type: string, fn: () => void) => { counts.removed += 1; listeners.delete(fn); },
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    };
  });
  const change = (next: boolean) => {
    matches = next;
    act(() => { listeners.forEach((fn) => fn()); });
  };
  return { counts, change };
}

function Probe({ query, draw }: { query: string; draw: number }) {
  const matches = useMediaQuery(query);
  return <p data-draw={draw}>{matches ? 'coarse' : 'fine'}</p>;
}

it('listens once while the query stays the same, however often the component draws', () => {
  const { counts } = countingMatchMedia();
  const { rerender } = render(<Probe query="(pointer: coarse)" draw={0} />);
  for (let draw = 1; draw <= 5; draw++) rerender(<Probe query="(pointer: coarse)" draw={draw} />);

  expect(counts.added).toBe(1);
  expect(counts.removed).toBe(0);
});

it('still follows the query as its answer changes', () => {
  const { change } = countingMatchMedia();
  const { container } = render(<Probe query="(pointer: coarse)" draw={0} />);
  expect(container.textContent).toBe('fine');

  change(true);
  expect(container.textContent).toBe('coarse');
});

it('listens to the new query when the query changes', () => {
  const { counts } = countingMatchMedia();
  const { rerender } = render(<Probe query="(pointer: coarse)" draw={0} />);
  rerender(<Probe query="(max-width: 1023.98px)" draw={1} />);

  expect(counts.added).toBe(2);
  expect(counts.removed).toBe(1);
});
