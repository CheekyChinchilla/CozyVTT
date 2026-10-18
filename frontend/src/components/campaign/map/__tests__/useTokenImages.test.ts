/**
 * Token pictures, loaded for the map (F357).
 *
 * The loader ran on every change to the token list, a move included, loaded
 * the pictures one after another, kept no record of one that failed, so it
 * asked for it again on every move, and a slow earlier run could finish last
 * and put back what a later one had replaced. Pictures are now loaded once
 * per address, side by side, and a failed one is not asked for again.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Token } from '@/types';
import { useTokenImages } from '../useTokenImages';

/** Every picture the hook asked the browser for, to load or fail by hand. */
const requested: FakeImage[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  crossOrigin = '';
  private source = '';
  set src(value: string) { this.source = value; requested.push(this); }
  get src() { return this.source; }
  getAttribute(name: string) { return name === 'src' ? this.source : null; }
  load() { act(() => { this.onload?.(); }); }
  fail() { act(() => { this.onerror?.(new Event('error')); }); }
}

const token = (id: string, imageUrl: string, x = 0): Token =>
  ({ id, name: id, imageUrl, position: { x, y: 0 }, size: { width: 1, height: 1 } }) as unknown as Token;

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useTokenImages', () => {
  it('asks for every picture at once and gives each token its picture once loaded', () => {
    const tokens = [token('a', '/p/1'), token('b', '/p/2')];
    const { result } = renderHook(({ list }) => useTokenImages(list), { initialProps: { list: tokens } });

    expect(requested.map((i) => i.src)).toEqual(['/p/1', '/p/2']);
    expect(result.current.size).toBe(0);

    requested[1].load();
    expect(result.current.get('b')).toBe(requested[1]);
    expect(result.current.has('a')).toBe(false);
  });

  it('loads a picture two tokens share once', () => {
    renderHook(() => useTokenImages([token('a', '/p/1'), token('b', '/p/1')]));
    expect(requested).toHaveLength(1);
  });

  it('asks for nothing again when a token moves', () => {
    const { rerender } = renderHook(({ list }) => useTokenImages(list), { initialProps: { list: [token('a', '/p/1')] } });
    requested[0].load();

    rerender({ list: [token('a', '/p/1', 3)] });

    expect(requested).toHaveLength(1);
  });

  it('does not ask again for a picture that failed', () => {
    const { result, rerender } = renderHook(({ list }) => useTokenImages(list), { initialProps: { list: [token('a', '/p/1')] } });
    requested[0].fail();

    rerender({ list: [token('a', '/p/1', 3)] });

    expect(requested).toHaveLength(1);
    expect(result.current.has('a')).toBe(false);
  });

  it('shows a token its new picture once that loads, whatever finishes first', () => {
    const { result, rerender } = renderHook(({ list }) => useTokenImages(list), { initialProps: { list: [token('a', '/p/old')] } });
    rerender({ list: [token('a', '/p/new')] });
    const [older, newer] = requested;

    newer.load();
    older.load();

    expect(result.current.get('a')).toBe(newer);
  });
});
