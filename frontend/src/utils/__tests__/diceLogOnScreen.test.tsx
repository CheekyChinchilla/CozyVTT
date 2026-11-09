/**
 * A Dice log counts as on the screen while the Dice tab is the one open, the
 * session panels are shown, and any part of the log is in the viewport. It
 * stops counting when it leaves the viewport or is taken down. A closed tab
 * is only invisible, so it stays in the viewport, and so does a closed phone
 * sheet with reduced motion, which fades where it stands.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef } from 'react';
import { render, act } from '@testing-library/react';
import { diceLogOnScreen, useDiceLogOnScreen } from '../diceLogOnScreen';
import { useGameStore } from '@/stores/gameStore';

const observers: Array<{ report: (isIntersecting: boolean) => void }> = [];

beforeEach(() => {
  observers.length = 0;
  useGameStore.getState().setSessionTab('dice');
  useGameStore.getState().setSessionShown(true);
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

  it('does not count a log in the viewport while another session tab is open', () => {
    useGameStore.getState().setSessionTab('chat');
    render(<Log />);
    act(() => observers[0].report(true));
    expect(diceLogOnScreen()).toBe(false);
  });

  it('does not count a log in the viewport while the session panels are not shown', () => {
    useGameStore.getState().setSessionShown(false);
    render(<Log />);
    act(() => observers[0].report(true));
    expect(diceLogOnScreen()).toBe(false);
  });
});
