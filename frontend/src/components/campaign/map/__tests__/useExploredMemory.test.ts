import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExploredMemory, type ExplorationSocket, type ExplorationState } from '../useExploredMemory';

/** A socket that records requests and lets the test deliver state events. */
function fakeSocket() {
  const handlers = new Set<(data: ExplorationState) => void>();
  const emit = vi.fn();
  const socket: ExplorationSocket = {
    on: (_e, h) => handlers.add(h),
    off: (_e, h) => handlers.delete(h),
    emit,
  };
  return {
    source: { getSocket: () => socket },
    emit,
    deliver: (data: ExplorationState) => act(() => { for (const h of handlers) h(data); }),
    listeners: () => handlers.size,
  };
}

describe('useExploredMemory', () => {
  it('asks for the memory of whoever it explores as, and keeps that reply', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', 1));
    expect(s.emit).toHaveBeenCalledWith('exploration:request', { mapId: 'map-1', userId: 'alice' });
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [3, 4] });
    expect([...hook.result.current.exploredCells!]).toEqual([3, 4]);
  });

  it('keeps the memory of the player the DM switches the preview to', () => {
    // The DM's own view explores as nobody; the listener is registered then.
    const s = fakeSocket();
    const hook = renderHook(({ who }) => useExploredMemory(s.source, 'map-1', true, who, 1), {
      initialProps: { who: null as string | null },
    });
    expect(s.emit).not.toHaveBeenCalled();

    hook.rerender({ who: 'alice' });
    expect(s.emit).toHaveBeenLastCalledWith('exploration:request', { mapId: 'map-1', userId: 'alice' });
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [7] });
    expect([...hook.result.current.exploredCells!]).toEqual([7]);

    hook.rerender({ who: 'bob' });
    expect(hook.result.current.exploredCells).toBeNull();
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [7] });
    expect(hook.result.current.exploredCells).toBeNull();
    s.deliver({ mapId: 'map-1', userId: 'bob', cells: [9] });
    expect([...hook.result.current.exploredCells!]).toEqual([9]);
  });

  it('drops another user\'s memory and another map\'s', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', 1));
    s.deliver({ mapId: 'map-1', userId: 'bob', cells: [1] });
    s.deliver({ mapId: 'map-2', userId: 'alice', cells: [2] });
    expect(hook.result.current.exploredCells).toBeNull();
  });

  it('a reset empties the memory whoever it is', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', 1));
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [3] });
    s.deliver({ mapId: 'map-1', userId: null, cells: [] });
    expect(hook.result.current.exploredCells?.size).toBe(0);
  });

  it('asks for nothing while memory or lighting is off, and adds fresh cells optimistically', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', false, 'alice', 1));
    expect(s.emit).not.toHaveBeenCalled();
    act(() => hook.result.current.addExplored([5, 6]));
    act(() => hook.result.current.addExplored([]));
    expect([...hook.result.current.exploredCells!]).toEqual([5, 6]);
  });

  it('unregisters its listener when it goes away', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', 1));
    expect(s.listeners()).toBe(1);
    hook.unmount();
    expect(s.listeners()).toBe(0);
  });

  it('waits for the connection to join the campaign, and asks again after a rejoin', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ joined }) => useExploredMemory(s.source, 'map-1', true, 'alice', joined),
      { initialProps: { joined: 0 } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ joined: 1 });
    expect(s.emit).toHaveBeenCalledTimes(1);
    hook.rerender({ joined: 2 });
    expect(s.emit).toHaveBeenCalledTimes(2);
    expect(s.emit).toHaveBeenLastCalledWith('exploration:request', { mapId: 'map-1', userId: 'alice' });
  });

  it('keeps what it is showing across a rejoin, instead of blanking the map', () => {
    // The re-request was emitted before the campaign had been rejoined, so the
    // server dropped it; clearing first meant the memory stayed blank until
    // the map or the previewed player changed.
    const s = fakeSocket();
    const hook = renderHook(
      ({ joined }) => useExploredMemory(s.source, 'map-1', true, 'alice', joined),
      { initialProps: { joined: 1 } }
    );
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [1, 2, 3] });
    expect([...hook.result.current.exploredCells!]).toEqual([1, 2, 3]);
    hook.rerender({ joined: 2 });
    expect([...hook.result.current.exploredCells!]).toEqual([1, 2, 3]);
  });
});
