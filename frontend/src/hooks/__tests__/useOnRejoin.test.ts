/**
 * The catch-up after a reconnect runs once the connection has joined the
 * campaign again, not when the transport comes back: a read made before the
 * socket is back in the campaign's room can miss an event sent in between (a
 * pause, say), and no later event corrects it.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOnRejoin } from '../useOnRejoin';

describe('useOnRejoin', () => {
  it('runs on each join after the first, and not on the first', () => {
    const catchUp = vi.fn();
    const { rerender } = renderHook(({ epoch }) => useOnRejoin(epoch, catchUp), { initialProps: { epoch: 0 } });
    rerender({ epoch: 1 });
    expect(catchUp).not.toHaveBeenCalled();
    rerender({ epoch: 2 });
    expect(catchUp).toHaveBeenCalledTimes(1);
    rerender({ epoch: 3 });
    expect(catchUp).toHaveBeenCalledTimes(2);
  });

  it('calls the latest catch-up it was given', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ epoch, fn }) => useOnRejoin(epoch, fn), { initialProps: { epoch: 1, fn: first } });
    rerender({ epoch: 2, fn: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
