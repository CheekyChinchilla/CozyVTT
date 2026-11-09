// ============================================
// What waits to be sent to a live connection
//
// A connection holds every packet its transport cannot take yet, with no
// limit of its own, and hands them all over together once it can (engine.io's
// `flush`); a client that does not read never lets it. What waits is counted
// here from the engine's `packetCreate` and `flush` events, for each
// connection and for each account over all its connections, and a
// connection past a bound is ended.
// ============================================

import logger from '../utils/logger';
import type { AuthenticatedSocket } from './auth';

/**
 * The most packets, and bytes of them, the server holds for one connection
 * that it cannot send yet because the client is not reading. A connection
 * past either is ended; a page still open then reconnects and asks for the
 * table again, as after any dropped connection.
 */
export const MAX_QUEUED_PACKETS = 10_000;
export const MAX_QUEUED_BYTES = 16 * 1024 * 1024;

/**
 * The most bytes one account may have waiting over all its connections
 * together. One account may hold MAX_SOCKETS_PER_USER of them, so the bound
 * on each alone let one account hold 40 times MAX_QUEUED_BYTES, past a
 * default install's memory. Twice one connection's bound: a page that has
 * just opened the largest map on a slow link, and a second tab beside it.
 */
export const MAX_QUEUED_BYTES_PER_USER = 2 * MAX_QUEUED_BYTES;

/** What waits for one connection now. */
interface Queue {
  packets: number;
  bytes: number;
}

/** Each connection's queue, by its socket's id. */
const queues = new Map<string, Queue>();
/** The bytes waiting for each account, over all its connections. */
const queuedByUser = new Map<string, number>();

/** What waits for a socket's connection now, for the tests. */
export function outgoingQueueOf(socketId: string): Readonly<Queue> | undefined {
  return queues.get(socketId);
}

/** The bytes waiting for an account's connections now. */
export function queuedBytesOfUser(userId: string): number {
  return queuedByUser.get(userId) ?? 0;
}

/** Add to an account's waiting bytes (less, with a negative), and answer the total. */
function addQueued(userId: string, bytes: number): number {
  const total = Math.max(0, (queuedByUser.get(userId) ?? 0) + bytes);
  if (total === 0) queuedByUser.delete(userId);
  else queuedByUser.set(userId, total);
  return total;
}

/** A packet's length as it waits to be sent: its text's characters, or its bytes. */
function packetLength(packet: unknown): number {
  if (!packet || typeof packet !== 'object' || !('data' in packet)) return 0;
  const { data } = packet;
  if (typeof data === 'string') return data.length;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data.byteLength;
  return 0;
}

/** The fields of an engine packet this module reads and changes. */
interface EnginePacket {
  type: string;
  data?: unknown;
  options?: object;
}

function isEnginePacket(packet: unknown): packet is EnginePacket {
  return typeof packet === 'object' && packet !== null && 'type' in packet && typeof packet.type === 'string';
}

/**
 * Empty a packet still waiting to be sent: it goes as engine.io's `noop`,
 * which every client drops. Its options are its own from now on, without
 * the frame a broadcast encodes once for every socket it goes to.
 */
function emptied(packet: EnginePacket): void {
  packet.type = 'noop';
  delete packet.data;
  packet.options = {};
}

/** The whole state being emitted now, and the socket it goes to: set by emitNewestState for the one emit. */
let emitting: { socketId: string; key: string } | null = null;

/**
 * End a socket's connection once more is waiting to be sent to it than
 * MAX_QUEUED_PACKETS or MAX_QUEUED_BYTES, or once its account has more than
 * MAX_QUEUED_BYTES_PER_USER waiting over all its connections. What waits is
 * counted from the last hand-over to the transport, and the account's share
 * goes when the socket disconnects or the connection closes. The transport
 * is discarded, so what waits is let go at once.
 *
 * A whole state (emitNewestState) waiting at the end of the queue, with
 * nothing but other whole states after it, is emptied when a newer one of
 * the same thing is queued: the page would apply the two one after the
 * other, so only the newer counts. One with anything else after it, such
 * as a change to the same walls, stays, so the two arrive in order.
 */
export function boundOutgoingQueue(socket: AuthenticatedSocket): void {
  const conn = socket.conn;
  const queue: Queue = { packets: 0, bytes: 0 };
  queues.set(socket.id, queue);
  /** The whole states waiting at the end of the queue, with nothing else after them. */
  const states = new Map<string, { packet: EnginePacket; length: number }>();
  /** The account the waiting bytes are counted for, once the socket has signed in. */
  let owner: string | undefined;
  let gone = false;
  let ending = false;
  const release = () => {
    if (owner) addQueued(owner, -queue.bytes);
    queue.packets = 0;
    queue.bytes = 0;
    states.clear();
  };
  const leave = () => {
    if (gone) return;
    release();
    gone = true;
    queues.delete(socket.id);
  };
  conn.on('packetCreate', (packet: unknown) => {
    if (gone) return;
    const length = packetLength(packet);
    if (!owner && socket.userId) {
      owner = socket.userId;
      addQueued(owner, queue.bytes);
    }
    queue.packets += 1;
    queue.bytes += length;
    let total = owner ? addQueued(owner, length) : 0;
    const key = emitting?.socketId === socket.id ? emitting.key : undefined;
    if (key === undefined) {
      states.clear();
    } else if (isEnginePacket(packet)) {
      const older = states.get(key);
      if (older) {
        emptied(older.packet);
        queue.bytes -= older.length;
        if (owner) total = addQueued(owner, -older.length);
      }
      states.set(key, { packet, length });
    }
    if (ending || (queue.packets <= MAX_QUEUED_PACKETS && queue.bytes <= MAX_QUEUED_BYTES && total <= MAX_QUEUED_BYTES_PER_USER)) return;
    ending = true;
    logger.warn('Ending a live connection whose client is not reading what it is sent', {
      socketId: socket.id, userId: socket.userId, packets: queue.packets, bytes: queue.bytes, accountBytes: total,
    });
    // Once the send under way has returned, not from inside it.
    setImmediate(() => conn.close(true));
  });
  conn.on('flush', release);
  conn.once('close', leave);
  socket.once('disconnect', leave);
}

/**
 * Send a socket `event`, which carries the whole state of something: `of`
 * names what (a map, a map and a member), the event's name included in the
 * comparison. The newest is all a page needs, so one of the same thing not
 * yet sent is emptied (boundOutgoingQueue).
 */
export function emitNewestState(
  target: { id: string; emit(event: string, data: unknown): unknown },
  event: string,
  data: unknown,
  of: string
): void {
  emitting = { socketId: target.id, key: `${event}:${of}` };
  try {
    target.emit(event, data);
  } finally {
    emitting = null;
  }
}
