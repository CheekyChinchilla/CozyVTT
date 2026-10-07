// ============================================
// Asking the server for a map's walls and lights, once the socket can answer
// and again after every rejoin.
//
// The page loads walls and lights with the map, and used to ask the socket
// for them only when the map changed. A rejoin reloads the same map, so
// nothing asked again, and a door opened while a player was disconnected
// stayed closed on their screen, blocking their sight, until the next full
// wall change. A request sent before the campaign is joined is dropped by the
// server, so this waits for the join, as the fog request does.
// ============================================

import { useEffect } from 'react';

/** The slice of a socket the request needs; the real one is socket.io's. */
export interface WallLightRequestSocket {
  emit(event: 'walls:request' | 'lights:request', data: { mapId: string }): unknown;
}

export interface WallLightRequestSocketSource {
  getSocket(): WallLightRequestSocket | null | undefined;
}

export function useWallLightRequest(
  socket: WallLightRequestSocketSource | null | undefined,
  mapId: string | undefined,
  /** 0 until the connection has joined the campaign, then a new number per join. */
  joinedEpoch: number
): void {
  useEffect(() => {
    if (!mapId || !joinedEpoch) return;
    const instance = socket?.getSocket();
    if (!instance) return;
    instance.emit('walls:request', { mapId });
    instance.emit('lights:request', { mapId });
  }, [socket, mapId, joinedEpoch]);
}
