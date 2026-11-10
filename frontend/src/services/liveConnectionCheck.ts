import { io } from 'socket.io-client';
import { liveConnectionTarget } from '@/services/socket';

/**
 * How this browser reached the live connection: over WebSocket, only by
 * polling (slower; a proxy in front that does not pass WebSocket connections
 * through), or not at all.
 */
export type LiveConnectionState = 'working' | 'polling only' | 'down';

/** How long the server has to take the connection before it counts as down. */
const CONNECT_TIMEOUT_MS = 10_000;
/** How long a connection made by polling has to move to WebSocket. */
const UPGRADE_WAIT_MS = 3_000;

/**
 * Open a live connection of its own, as a campaign page does, and report once
 * how it went; for the Admin Panel's status card. It goes with the browser's
 * own sign-in and sends nothing, so it never joins a campaign: nobody sees
 * the admin arrive at a table. It is closed as soon as it has an answer, or by
 * the function it returns, which reports nothing.
 */
export function checkLiveConnection(report: (state: LiveConnectionState) => void): () => void {
  const { origin, options } = liveConnectionTarget();
  const socket = io(origin, { ...options, forceNew: true, reconnection: false });
  let done = false;
  let connected = false;
  let upgradeWait: ReturnType<typeof setTimeout> | undefined;
  const deadline = setTimeout(() => finish('down'), CONNECT_TIMEOUT_MS);

  function finish(state?: LiveConnectionState) {
    if (done) return;
    done = true;
    clearTimeout(deadline);
    clearTimeout(upgradeWait);
    socket.disconnect();
    if (state) report(state);
  }

  socket.on('connect', () => {
    connected = true;
    clearTimeout(deadline);
    if (socket.io.engine.transport.name === 'websocket') {
      finish('working');
      return;
    }
    // socket.io may start by polling and move to WebSocket a moment later.
    socket.io.engine.on('upgrade', (transport) => {
      if (transport.name === 'websocket') finish('working');
    });
    upgradeWait = setTimeout(() => finish('polling only'), UPGRADE_WAIT_MS);
  });
  // Closed from the other end: reached by polling if it had connected.
  socket.on('disconnect', () => finish(connected ? 'polling only' : 'down'));
  socket.on('connect_error', () => finish('down'));

  return () => finish();
}
