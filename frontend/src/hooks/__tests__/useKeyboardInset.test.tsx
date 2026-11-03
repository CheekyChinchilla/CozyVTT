/**
 * How much of the screen's foot an on-screen keyboard covers.
 *
 * Safari on an iPhone lays the keyboard over the page and leaves the page
 * its size, so a sheet standing on the foot of the screen, the chat box in
 * it, went under the keyboard. The visible part of the page
 * (`window.visualViewport`) shrinks instead: what the keyboard covers is the
 * page's height less the visible part and how far it is scrolled down.
 * Chrome on Android resizes the page itself, which leaves 0.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardInset } from '../useKeyboardInset';

/** A visual viewport of `height` scrolled `offsetTop` down, which tells of its changes. */
function stubViewport(height: number, offsetTop = 0) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number };
  target.height = height;
  target.offsetTop = offsetTop;
  Object.defineProperty(window, 'visualViewport', { value: target, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
  return target;
}

afterEach(() => {
  Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
});

describe('useKeyboardInset', () => {
  it('is 0 with no keyboard, and the keyboard\'s height while it is up, following the visible part', () => {
    const viewport = stubViewport(844);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
    act(() => {
      viewport.height = 508;
      viewport.offsetTop = 30;
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(306);
    act(() => {
      viewport.height = 844;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe(0);
  });

  it('takes a strip under 80 pixels, such as the browser\'s own bar, for no keyboard', () => {
    stubViewport(790);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it('is 0 in a browser with no visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });
});
