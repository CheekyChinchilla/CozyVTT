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
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', true, 0));
    expect(s.emit).toHaveBeenCalledWith('exploration:request', { mapId: 'map-1', userId: 'alice' });
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [3, 4] });
    expect([...hook.result.current.exploredCells!]).toEqual([3, 4]);
  });

  it('keeps the memory of the player the DM switches the preview to', () => {
    // The DM's own view explores as nobody; the listener is registered then.
    const s = fakeSocket();
    const hook = renderHook(({ who }) => useExploredMemory(s.source, 'map-1', true, who, true, 0), {
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
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', true, 0));
    s.deliver({ mapId: 'map-1', userId: 'bob', cells: [1] });
    s.deliver({ mapId: 'map-2', userId: 'alice', cells: [2] });
    expect(hook.result.current.exploredCells).toBeNull();
  });

  it('a reset empties the memory whoever it is', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', true, 0));
    s.deliver({ mapId: 'map-1', userId: 'alice', cells: [3] });
    s.deliver({ mapId: 'map-1', userId: null, cells: [] });
    expect(hook.result.current.exploredCells?.size).toBe(0);
  });

  it('asks for nothing while memory or lighting is off, and adds fresh cells optimistically', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', false, 'alice', true, 0));
    expect(s.emit).not.toHaveBeenCalled();
    act(() => hook.result.current.addExplored([5, 6]));
    act(() => hook.result.current.addExplored([]));
    expect([...hook.result.current.exploredCells!]).toEqual([5, 6]);
  });

  it('unregisters its listener when it goes away', () => {
    const s = fakeSocket();
    const hook = renderHook(() => useExploredMemory(s.source, 'map-1', true, 'alice', true, 0));
    expect(s.listeners()).toBe(1);
    hook.unmount();
    expect(s.listeners()).toBe(0);
  });

  it('waits for the socket to authenticate before asking, and asks again after a reconnect', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ ready, epoch }) => useExploredMemory(s.source, 'map-1', true, 'alice', ready, epoch),
      { initialProps: { ready: false, epoch: 0 } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ ready: true, epoch: 0 });
    expect(s.emit).toHaveBeenCalledTimes(1);
    hook.rerender({ ready: true, epoch: 1 });
    expect(s.emit).toHaveBeenCalledTimes(2);
    expect(s.emit).toHaveBeenLastCalledWith('exploration:request', { mapId: 'map-1', userId: 'alice' });
  });
});
