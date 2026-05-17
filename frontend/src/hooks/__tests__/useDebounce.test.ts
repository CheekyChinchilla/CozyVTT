import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });

    // Advance time but not enough
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('initial');
  });

  it('updates after the delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('resets the timer on each new value change', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(200); });

    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(200); });

    // Neither 'b' nor 'c' should have committed yet (only 200ms since last change)
    expect(result.current).toBe('a');

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('c');
  });

  it('uses 300ms as the default delay', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebounce(value),
      { initialProps: { value: 'start' } }
    );

    rerender({ value: 'end' });

    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('start');

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('end');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useDebounce(value, 100),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 42 });
    act(() => { vi.advanceTimersByTime(100); });

    expect(result.current).toBe(42);
  });
});
