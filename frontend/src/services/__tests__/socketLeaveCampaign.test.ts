/**
 * Leaving the campaign page stops the socket client for good.
 *
 * When the server closes a joined socket the client builds another one itself,
 * and when that one gets no answer within ten seconds it throws it away and
 * tries again, for as long as it takes. disconnect() forgot the campaign only
 * if a socket was still held, and a socket thrown away by the timeout leaves
 * none, so a person who left the page between two tries had the loop carry on
 * in the background: a new socket every few seconds for a campaign they were
 * no longer in, and, once the server answered, a live connection nobody used
 * that counted against the account's limit.
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

vi.mock('@/services/api', () => ({
  api: { listCampaigns: () => Promise.resolve({ campaigns: [] }) },
  default: { listCampaigns: () => Promise.resolve({ campaigns: [] }) },
}));

const current = () => sockets[sockets.length - 1];

type SocketClient = (typeof import('@/services/socket'))['default'];

async function joined(client: SocketClient, campaignId: string) {
  const pending = client.connect(campaignId);
  await Promise.resolve();
  current().fire('connect');
  current().fire('connected');
  current().fire('authenticated');
  await pending;
}

describe('the socket client after the person leaves the campaign page', () => {
  let client: SocketClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sockets.length = 0;
    vi.resetModules();
    client = (await import('@/services/socket')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('builds no more sockets once a connect that timed out is followed by leaving the page', async () => {
    await joined(client, 'campaign-1');

    // The server closes the socket; the client builds another, which the
    // server never answers, so the ten second timeout throws it away.
    current().fire('disconnect', 'io server disconnect');
    for (let i = 0; i < 40 && sockets.length < 2; i++) await vi.advanceTimersByTimeAsync(500);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(client.getSocket()).toBeNull();

    // The loop has scheduled its next try. The person leaves the page.
    client.disconnect();
    const built = sockets.length;

    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(sockets).toHaveLength(built);
    expect(client.isConnectInProgress()).toBe(false);
  });

  it('does not let a connect abandoned by leaving the page time out the next campaign', async () => {
    // Connecting to the first campaign, with no answer yet.
    const first = client.connect('campaign-1');
    first.catch(() => undefined);
    await Promise.resolve();
    expect(sockets).toHaveLength(1);

    // The person leaves after four seconds and opens another campaign.
    await vi.advanceTimersByTimeAsync(4_000);
    client.disconnect();
    const second = client.connect('campaign-2');
    let joinedSecond = false;
    void second.then(() => { joinedSecond = true; }, () => undefined);
    await Promise.resolve();
    expect(sockets).toHaveLength(2);

    // Eight seconds on, the first connect's ten seconds are over, but the
    // second has had only eight, and its server answers now.
    await vi.advanceTimersByTimeAsync(8_000);
    current().fire('connect');
    current().fire('connected');
    current().fire('authenticated');
    await vi.advanceTimersByTimeAsync(0);

    expect(joinedSecond).toBe(true);
    expect(client.getSocket()).toBe(current());
  });
});
