// ============================================
// Acknowledgements
//
// A client may pass a function as an event's last argument, and socket.io
// carries the server's answer back to it. A handler that takes one answers
// it once: `{ ok: true, ... }` when the request was carried out, or
// `{ ok: false, error }` when it was refused, and then sends no `error`
// event, which every panel listening for errors would take as its own. A
// client that passes no function is refused with `error`, as before.
// ============================================

import type { AuthenticatedSocket } from './auth';

export type AckAnswer = { ok: true; [field: string]: unknown } | { ok: false; error: string };
export type SocketAck = (answer: AckAnswer) => void;

/** The acknowledgement a client passed, if the argument is one. */
export function ackFrom(arg: unknown): SocketAck | null {
  return typeof arg === 'function' ? (arg as SocketAck) : null;
}

/** Refuse a request: through its acknowledgement when it has one, otherwise as an `error` event. */
export function refuseRequest(socket: AuthenticatedSocket, ack: SocketAck | null, message: string): void {
  if (ack) ack({ ok: false, error: message });
  else socket.emit('error', { message });
}
