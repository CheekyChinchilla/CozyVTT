import type { Server as HTTPServer } from 'http';
import type { Server } from 'socket.io';
import logger from '../utils/logger';
import { agedOutMessage, sessionHasAgedOut } from '../services/signedIn';
import { socketSignIn, type AuthenticatedSocket } from './auth';
import { endSignedOutSocket } from './utils';

/**
 * Ending live connections whose sign-in has ended.
 *
 * A socket checks its sign-in at the handshake and when it joins a campaign
 * (events.ts), and nothing else asks while it stays open. A tab left on a
 * campaign kept its connection past the sign-in limit, and after its session
 * had idled out of the store, acting with the role it cached. Every minute
 * this ends each socket whose sign-in is past the limit, from the time it
 * cached at the handshake; every fifth minute it also reads each socket's
 * session from the store and ends those that are gone. Each is told why, as
 * the routes that end a sign-in tell theirs (endLiveSockets).
 */

/** How often the sockets are swept. */
export const SWEEP_EVERY_MS = 60_000;

/** Every this many sweeps, each socket's session is also read from the store. */
export const STORE_CHECK_EVERY = 5;

/** What a socket is told when its session has ended some other way than the limit. */
export const SIGN_IN_ENDED_MESSAGE = 'Your sign-in has ended. Sign in again.';

/**
 * One sweep over the sockets on this instance. `checkStore` reads each
 * socket's session too; `now` is the time the limit is measured at. A socket
 * still at its handshake has no user yet and is left to it. Returns how many
 * were ended.
 */
export async function sweepLiveSockets(io: Server, options: { checkStore: boolean; now?: number }): Promise<number> {
  const now = options.now ?? Date.now();
  let ended = 0;
  for (const socket of [...io.of('/').sockets.values()] as AuthenticatedSocket[]) {
    if (!socket.userId || !socket.connected) continue;
    try {
      if (sessionHasAgedOut({ signedInAt: socket.signedInAt }, now)) {
        endSignedOutSocket(socket, agedOutMessage());
        ended += 1;
        continue;
      }
      if (!options.checkStore) continue;
      const signIn = await socketSignIn(socket, now);
      if (signIn === 'live' || !socket.connected) continue;
      endSignedOutSocket(socket, signIn === 'aged-out' ? agedOutMessage() : SIGN_IN_ENDED_MESSAGE);
      ended += 1;
    } catch (error) {
      logger.error('Could not check a live connection against its sign-in', { err: error, socketId: socket.id });
    }
  }
  return ended;
}

export interface SignInSweep {
  stop(): void;
  readonly stopped: boolean;
}

/**
 * Sweep `io` on a timer until `stop()` or until `httpServer` closes, which
 * closing the Socket.io server does. The timer does not keep the process
 * alive. A sweep still running when the next is due lets that one pass.
 */
export function startSignInSweep(
  io: Server,
  httpServer: HTTPServer,
  options: { everyMs?: number; storeCheckEvery?: number; now?: () => number } = {}
): SignInSweep {
  const everyMs = options.everyMs ?? SWEEP_EVERY_MS;
  const storeCheckEvery = options.storeCheckEvery ?? STORE_CHECK_EVERY;
  const now = options.now ?? Date.now;
  let tick = 0;
  let running = false;
  let stopped = false;

  const timer = setInterval(() => {
    tick += 1;
    if (running) return;
    running = true;
    void sweepLiveSockets(io, { checkStore: tick % storeCheckEvery === 0, now: now() })
      .catch((error: unknown) => logger.error('Live connection sweep failed', { err: error }))
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    httpServer.off('close', stop);
  };
  httpServer.once('close', stop);

  return {
    stop,
    get stopped() {
      return stopped;
    },
  };
}
