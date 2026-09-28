/**
 * What the socket client does when the server stops accepting its sign-in.
 *
 * Ending a sign-in (a password change on another device, an admin reset, a
 * restore) ends its live sockets too. The client answered every server-side
 * disconnect by reconnecting, and every new socket was accepted as a
 * transport and then refused as `Unauthorized`; since the attempt counter
 * went back to zero on each transport connect, it never ran out, and the tab
 * kept opening and losing sockets until the user happened to click something
 * that made a REST call. The client now stops at an `Unauthorized` refusal
 * and asks the REST API, whose own handling of a 401 or a required password
 * change sends the user where they need to go, and its attempts only reset
 * once a socket has actually joined.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Minimal stand-in for a socket.io Socket. */
class FakeSocket {
  handlers = new Map<string, Set<(data: unknown) => void>>();
  connected = false;

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
  emit() {
    /* outbound, irrelevant here */
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

const listCampaigns = vi.fn();
vi.mock('@/services/api', () => ({
  api: { listCampaigns: () => listCampaigns() },
  default: { listCampaigns: () => listCampaigns() },
}));

const current = () => sockets[sockets.length - 1];

type SocketClient = (typeof import('@/services/socket'))['default'];

/** Let the backoff run until the client builds its next socket; false if it never does. */
async function nextSocket(): Promise<boolean> {
  const before = sockets.length;
  for (let i = 0; i < 80; i++) {
    await vi.advanceTimersByTimeAsync(500);
    if (sockets.length > before) return true;
  }
  return false;
}

async function joined(client: SocketClient) {
  const pending = client.connect('campaign-1');
  await Promise.resolve();
  current().fire('connect');
  current().fire('connected');
  current().fire('authenticated');
  await pending;
}

describe('the socket client when the server stops accepting its sign-in', () => {
  let client: SocketClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    sockets.length = 0;
    listCampaigns.mockReset();
    vi.resetModules();
    client = (await import('@/services/socket')).default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops reconnecting at an Unauthorized refusal and asks the REST API instead', async () => {
    // The API answers 401; its interceptor does the redirect, so here it only rejects.
    listCampaigns.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));
    await joined(client);

    // The sign-in is ended from elsewhere: the server says why and closes the socket.
    current().fire('error', { message: 'Your password was changed' });
    current().fire('disconnect', 'io server disconnect');
    expect(await nextSocket()).toBe(true);

    // The new socket reaches the server, which no longer knows the sign-in.
    current().fire('connect');
    current().fire('error', { message: 'Unauthorized' });
    current().fire('disconnect', 'io server disconnect');
    expect(await nextSocket()).toBe(false);

    expect(sockets).toHaveLength(2);
    expect(listCampaigns).toHaveBeenCalledTimes(1);
  });

  // A refusal can come from a moment the server could not read its sessions,
  // and the check that follows can fail for the same reason. Only a 401 or a
  // required password change says the sign-in is gone; anything else is asked
  // again, and the client reconnects once the answer is that it is fine.
  it('asks again after a check that fails for any other reason, then reconnects', async () => {
    listCampaigns
      .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
      .mockRejectedValueOnce(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }))
      .mockResolvedValue({ campaigns: [] });
    await joined(client);

    current().fire('connect');
    current().fire('error', { message: 'Unauthorized' });
    current().fire('disconnect', 'io server disconnect');
    expect(await nextSocket()).toBe(true);

    expect(listCampaigns).toHaveBeenCalledTimes(3);
    expect(sockets).toHaveLength(2);
  });

  it('reconnects as before when the REST API says the sign-in is still good', async () => {
    listCampaigns.mockResolvedValue({ campaigns: [] });
    await joined(client);

    current().fire('connect');
    current().fire('error', { message: 'Unauthorized' });
    current().fire('disconnect', 'io server disconnect');
    expect(await nextSocket()).toBe(true);

    expect(listCampaigns).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(2);
  });

  it('gives up after its attempts when the server keeps closing a socket before it joins', async () => {
    await joined(client);

    // The server says why before closing, as endLiveSockets does; that
    // error is what lets the next attempt start.
    for (let i = 0; i < 20; i++) {
      current().fire('connect');
      current().fire('error', { message: 'Server is restarting' });
      current().fire('disconnect', 'io server disconnect');
      if (!(await nextSocket())) break;
    }

    // The first socket plus at most five retries, however long it goes on.
    expect(sockets.length).toBeLessThanOrEqual(6);
  });
});
