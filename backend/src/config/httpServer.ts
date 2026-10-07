/**
 * How long the backend's HTTP server lets a request take to arrive.
 *
 * Node answers 408 to a request whose body has not all arrived within the
 * server's requestTimeout, 300 seconds by default. The bundled nginx streams
 * a campaign import (up to 500 MB) and a backup restore (up to 4 GB) straight
 * through to the backend, so on a home connection a large one took longer
 * than that and was cut off here, whatever nginx allowed. An hour covers a
 * 500 MB archive at a little over 1 Mbit/s.
 *
 * This does not keep a stalled upload open for an hour. nginx's own
 * client_body_timeout (60 seconds by default) drops a client that stops
 * sending, which ends the request here too, and headersTimeout keeps Node's
 * default, so a client that is slow to send its headers is still dropped
 * within a minute.
 */
import type { Server } from 'http';

export const REQUEST_TIMEOUT_MS = 60 * 60 * 1000;

/** Give `server` the request timeout above, leaving its headers timeout as it is. */
export function applyRequestTimeouts(server: Server): void {
  server.requestTimeout = REQUEST_TIMEOUT_MS;
}
