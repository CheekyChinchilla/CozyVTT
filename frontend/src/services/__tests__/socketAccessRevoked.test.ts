/**
 * The socket client stops when the server says the connection's access has
 * ended.
 *
 * Removing a member, deleting a campaign and ending a sign-in now send
 * `campaign.access.revoked` with the reason. A removed member's or a deleted
 * campaign's connection stays open but can do nothing; an ended sign-in's is
 * closed by the server, and the client used to answer that by reconnecting
 * and asking the REST API whether it was still signed in. After this event
 * there is nothing to reconnect to, so it does neither, and the page decides
 * what to show.
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

describe('the socket client after campaign.access.revoked', () => {
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

  it('does not reconnect, or ask whether it is signed in, when the server then closes the connection', async () => {
    await joined(client);

    current().fire('campaign.access.revoked', { campaignId: 'campaign-1', reason: 'signed-out', message: 'Your password was changed on another device. Sign in again.' });
    current().fire('disconnect', 'io server disconnect');

    expect(await nextSocket()).toBe(false);
    expect(sockets).toHaveLength(1);
    expect(listCampaigns).not.toHaveBeenCalled();
  });

  it('hands the event to the page', async () => {
    const heard = vi.fn();
    client.on('campaign.access.revoked', heard);
    await joined(client);

    const revoked = { campaignId: 'campaign-1', reason: 'removed', message: 'You were removed from this campaign.' };
    current().fire('campaign.access.revoked', revoked);

    expect(heard).toHaveBeenCalledWith(revoked);
  });

  it('reconnects as usual after a later connect to a campaign', async () => {
    await joined(client);
    current().fire('campaign.access.revoked', { campaignId: 'campaign-1', reason: 'removed', message: 'You were removed from this campaign.' });

    // Invited back and opened again: a fresh connect starts clean.
    await joined(client);
    current().fire('disconnect', 'io server disconnect');

    expect(await nextSocket()).toBe(true);
  });
});
