import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFogStateRequest } from '../useFogStateRequest';

/**
 * The fog request is only worth sending once the socket has authenticated:
 * the server drops anything that arrives before, silently, and nothing asked
 * again. On an instance where the map's REST load finishes before the socket
 * handshake, that left the DM with no fog state on every load: no tint, a
 * preview with everything covered, and reveals that could not be dragged.
 */
function fakeSocket() {
  const emit = vi.fn();
  return { source: { getSocket: () => ({ emit }) }, emit };
}

describe('useFogStateRequest', () => {
  it('asks for the fog state once the socket is ready, not before', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ ready }) => useFogStateRequest(s.source, 'map-1', true, ready, 0),
      { initialProps: { ready: false } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ ready: true });
    expect(s.emit).toHaveBeenCalledTimes(1);
    expect(s.emit).toHaveBeenCalledWith('fog:request_state', { mapId: 'map-1' });
  });

  it('asks again after a reconnect, and when fog is switched on or the map changes', () => {
    const s = fakeSocket();
    const hook = renderHook(
      ({ mapId, fogEnabled, epoch }) => useFogStateRequest(s.source, mapId, fogEnabled, true, epoch),
      { initialProps: { mapId: 'map-1', fogEnabled: false, epoch: 0 } }
    );
    expect(s.emit).not.toHaveBeenCalled();
    hook.rerender({ mapId: 'map-1', fogEnabled: true, epoch: 0 });
    expect(s.emit).toHaveBeenCalledTimes(1);
    hook.rerender({ mapId: 'map-1', fogEnabled: true, epoch: 1 });
    expect(s.emit).toHaveBeenCalledTimes(2);
    hook.rerender({ mapId: 'map-2', fogEnabled: true, epoch: 1 });
    expect(s.emit).toHaveBeenLastCalledWith('fog:request_state', { mapId: 'map-2' });
  });

  it('asks for nothing without a map, with fog off, or with no socket', () => {
    const s = fakeSocket();
    renderHook(() => useFogStateRequest(s.source, undefined, true, true, 0));
    renderHook(() => useFogStateRequest(s.source, 'map-1', false, true, 0));
    renderHook(() => useFogStateRequest(null, 'map-1', true, true, 0));
    expect(s.emit).not.toHaveBeenCalled();
  });
});
