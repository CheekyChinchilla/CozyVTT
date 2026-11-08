/**
 * A Dice log counts as on the screen while any part of it is in the
 * viewport, and stops counting when it leaves it or is taken down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { diceLogOnScreen, useDiceLogOnScreen } from '../diceLogOnScreen';

const observers: Array<{ report: (isIntersecting: boolean) => void }> = [];

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', class {
    private target: Element | null = null;
    constructor(callback: IntersectionObserverCallback) {
      observers.push({
        report: (isIntersecting) => callback([{ isIntersecting, target: this.target } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
      });
    }
    observe(target: Element) { this.target = target; }
    disconnect() {}
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Log() {
  const ref = useRef<HTMLDivElement>(null);
  useDiceLogOnScreen(ref);
  return <div ref={ref} role="log" />;
}

describe('diceLogOnScreen', () => {
  it('is true while a log is in the viewport and false once it leaves', () => {
    render(<Log />);
    expect(diceLogOnScreen()).toBe(false);
    act(() => observers[0].report(true));
    expect(diceLogOnScreen()).toBe(true);
    act(() => observers[0].report(false));
    expect(diceLogOnScreen()).toBe(false);
  });

  it('stops counting a log taken down while on the screen', () => {
    const { unmount } = render(<Log />);
    act(() => observers[0].report(true));
    unmount();
    expect(diceLogOnScreen()).toBe(false);
  });
});
