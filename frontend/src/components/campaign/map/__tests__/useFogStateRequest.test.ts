import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFogStateRequest } from '../useFogStateRequest';

/**
 * The fog request is only worth sending once the connection has joined the
 * campaign: the server drops anything from a socket it has not authenticated,
 * silently, and nothing asks again. On an instance where the map's REST load
 * finishes before the socket handshake, that left the DM with no fog state on
 * every load: no tint, a preview with everything covered, and reveals that
 * could not be dragged.
 *
 * `joinedEpoch` is 0 until the socket has authenticated, and a new number
 * after each re-authentication, so a reconnect asks again. It deliberately
 * does not follow the transport-level reconnect, which happens before the
 * campaign has been rejoined and so produced a request the server dropped.
 */
function fakeSocket() {
  const emit = vi.fn();
  return { source: { getSocket: () => ({ emit }) }, emit };
}

describe('useFogStateRequest', () => {
  it('asks once the connection has joined the campaign, not before', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ joined }) => useFogStateRequest(s.source, 'map-1', true, joined),
      { initialProps: { joined: 0 } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ joined: 1 });
    expect(s.emit).toHaveBeenCalledTimes(1);
    expect(s.emit).toHaveBeenCalledWith('fog:request_state', { mapId: 'map-1' });
  });

  it('asks again after a rejoin, and when fog is switched on or the map changes', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ mapId, fogEnabled, joined }) => useFogStateRequest(s.source, mapId, fogEnabled, joined),
      { initialProps: { mapId: 'map-1', fogEnabled: false, joined: 1 } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ mapId: 'map-1', fogEnabled: true, joined: 1 });
    expect(s.emit).toHaveBeenCalledTimes(1);
    hook.rerender({ mapId: 'map-1', fogEnabled: true, joined: 2 });
    expect(s.emit).toHaveBeenCalledTimes(2);
    hook.rerender({ mapId: 'map-2', fogEnabled: true, joined: 2 });
    expect(s.emit).toHaveBeenLastCalledWith('fog:request_state', { mapId: 'map-2' });
  });

  it('asks for nothing without a map, with fog off, or with no socket', () => {
    const s = fakeSocket();
    renderHook(() => useFogStateRequest(s.source, undefined, true, 1));
    renderHook(() => useFogStateRequest(s.source, 'map-1', false, 1));
    renderHook(() => useFogStateRequest(null, 'map-1', true, 1));
    expect(s.emit).not.toHaveBeenCalled();
  });
});
