import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWallLightRequest } from '../useWallLightRequest';

/**
 * A map's walls and lights are asked for once the page has joined the
 * campaign, and again after every rejoin: a door opened while a player was
 * disconnected is otherwise missed until the next full wall change.
 */
function fakeSocket() {
  const emit = vi.fn();
  return { source: { getSocket: () => ({ emit }) }, emit };
}

describe('useWallLightRequest', () => {
  it('asks once the connection has joined the campaign, and again after a rejoin', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ mapId, joined }) => useWallLightRequest(s.source, mapId, joined),
      { initialProps: { mapId: 'map-1', joined: 0 } }
    );
    expect(s.emit).not.toHaveBeenCalled();

    hook.rerender({ mapId: 'map-1', joined: 1 });
    expect(s.emit.mock.calls).toEqual([
      ['walls:request', { mapId: 'map-1' }],
      ['lights:request', { mapId: 'map-1' }],
    ]);

    hook.rerender({ mapId: 'map-1', joined: 2 });
    expect(s.emit).toHaveBeenCalledTimes(4);

    hook.rerender({ mapId: 'map-2', joined: 2 });
    expect(s.emit).toHaveBeenLastCalledWith('lights:request', { mapId: 'map-2' });
  });

  it('asks for nothing without a map or a socket', () => {
    const s = fakeSocket();
    renderHook(() => useWallLightRequest(s.source, undefined, 1));
    renderHook(() => useWallLightRequest(null, 'map-1', 1));
    expect(s.emit).not.toHaveBeenCalled();
  });
});
