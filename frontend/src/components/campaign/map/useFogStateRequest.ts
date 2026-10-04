// ============================================
// Asking the server for a map's fog state, once the socket can answer.
//
// The request used to go out the moment the map loaded. When the map's REST
// load finished before the socket handshake, socket.io buffered the request
// and flushed it on connect, ahead of the authenticate exchange, and the
// server drops anything from a socket it has not authenticated, silently.
// Nothing asked again, so on an instance where that ordering held the DM had
// no fog state on every load: no tint on the map, a preview with everything
// covered, and reveals that could not be dragged.
//
// It now waits for the campaign to be joined. That is later than the socket
// reconnecting: after a drop, socket.io is connected again a moment before
// the client has re-authenticated, and a request sent in that window is
// dropped exactly as before.
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
  /**
   * 0 until the connection has authenticated into the campaign, and a new
   * number after each re-authentication, so a rejoin asks again.
   */
  joinedEpoch: number
): void {
  useEffect(() => {
    if (!mapId || !fogEnabled || !joinedEpoch) return;
    socket?.getSocket()?.emit('fog:request_state', { mapId });
  }, [socket, mapId, fogEnabled, joinedEpoch]);
}
