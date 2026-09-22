// ============================================
// Asking the server for a map's fog state, once the socket can answer.
//
// The request used to go out the moment the map loaded. When the map's REST
// load finished before the socket handshake, socket.io buffered the request
// and flushed it on connect, ahead of the authenticate exchange, and the
// server drops anything from a socket it has not authenticated, silently.
// Nothing asked again, so on an instance where that ordering held the DM had
// no fog state on every load: no tint on the map, a preview with everything
// covered, and reveals that could not be dragged. The request now waits for
// the socket to report authenticated, and goes again after a reconnect.
// ============================================

import { useEffect } from 'react';

/** The slice of a socket the request needs; the real one is socket.io's. */
export interface FogRequestSocket {
  emit(event: 'fog:request_state', data: { mapId: string }): unknown;
}

export interface FogRequestSocketSource {
  getSocket(): FogRequestSocket | null | undefined;
}

export function useFogStateRequest(
  socket: FogRequestSocketSource | null | undefined,
  mapId: string | undefined,
  fogEnabled: boolean,
  /** The socket has authenticated into the campaign; the server answers only then. */
  ready: boolean,
  /** Bumped on every reconnect, so the state is asked for again on the new socket. */
  epoch: number
): void {
  useEffect(() => {
    if (!mapId || !fogEnabled || !ready) return;
    socket?.getSocket()?.emit('fog:request_state', { mapId });
  }, [socket, mapId, fogEnabled, ready, epoch]);
}
