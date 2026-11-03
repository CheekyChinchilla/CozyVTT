/**
 * A drag's frames are sent only while they can go at once.
 *
 * socket.io keeps every event emitted while the connection is down and sends
 * them all on reconnect, ahead of the page's join. A drag held through a
 * dropped connection piled up its frames that way, sixty a second, and the
 * server takes at most 500 events a second from one connection, so the join
 * after them could be the one dropped. A frame now goes volatile: dropped
 * when it cannot be sent. The pick-up and the put-down are kept, so the
 * token still ends where it was put down.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Minimal stand-in for a socket.io Socket, with its volatile flag. */
class FakeSocket {
  handlers = new Map<string, Set<(data: unknown) => void>>();
  connected = false;
  sent: string[] = [];
  sentVolatile: string[] = [];
  volatile = { emit: (event: string) => { this.sentVolatile.push(event); return this; } };

  on(event: string, cb: (data: unknown) => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(cb);
  }
  off(event: string, cb?: (data: unknown) => void) {
    if (cb) this.handlers.get(event)?.delete(cb);
    else this.handlers.delete(event);
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  disconnect() {
    this.connected = false;
  }
  emit(event: string) {
    this.sent.push(event);
  }
  fire(event: string, data?: unknown) {
    for (const cb of this.handlers.get(event) ?? []) cb(data);
  }
}

const sockets: FakeSocket[] = [];

vi.mock('socket.io-client', () => ({
  io: () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  },
}));

vi.mock('@/services/api', () => ({
  api: { listCampaigns: () => Promise.resolve([]) },
  default: { listCampaigns: () => Promise.resolve([]) },
}));

const current = () => sockets[sockets.length - 1];

type SocketClient = (typeof import('@/services/socket'))['default'];

describe("a drag's messages", () => {
  let client: SocketClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    sockets.length = 0;
    vi.resetModules();
    client = (await import('@/services/socket')).default;
    const pending = client.connect('campaign-1');
    await Promise.resolve();
    current().fire('connect');
    current().fire('connected');
    current().fire('authenticated');
    await pending;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends each frame volatile, so none waits for a connection that is down', () => {
    client.emitTokenMove({ tokenId: 't', mapId: 'm', x: 1, y: 2 });
    expect(current().sentVolatile).toEqual(['token.move']);
    expect(current().sent).not.toContain('token.move');
  });

  it('keeps the pick-up and the put-down, so the token ends where it was put', () => {
    client.emitTokenMoveStart({ tokenId: 't', mapId: 'm' });
    client.emitTokenMoveEnd({ tokenId: 't', mapId: 'm', x: 3, y: 4 });
    expect(current().sent).toEqual(expect.arrayContaining(['token.move.start', 'token.move.end']));
    expect(current().sentVolatile).toEqual([]);
  });
});
