/**
 * The client's half of the DM handover.
 *
 * The server broadcasts `campaign.dm.transferred` to the whole campaign when the
 * seat moves, and the page uses it to re-derive who may do what. That name is a
 * contract between two codebases with nothing but a string literal holding them
 * together, so it is pinned here: a rename on either side that misses the other
 * would otherwise show up as a handover that silently does nothing to the UI
 * until someone reloads.
 *
 * The reconnect case matters for the same reason it did for every other
 * listener — see socketListenerRegistry.test.ts for the bug that established it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DmTransferredBroadcast } from '@/types';

/** Minimal stand-in for a socket.io Socket, recording what is attached to it. */
class FakeSocket {
  handlers = new Map<string, Set<(data: unknown) => void>>();
  connected = false;
  disconnected = false;

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
    this.disconnected = true;
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

const current = () => sockets[sockets.length - 1];

async function connect(client: { connect: (id: string) => Promise<void> }, campaignId = 'campaign-1') {
  const pending = client.connect(campaignId);
  await Promise.resolve();
  current().fire('connected');
  current().fire('authenticated');
  await pending;
}

const transfer: DmTransferredBroadcast = {
  campaignId: 'campaign-1',
  previousDmId: 'user-old-dm',
  newDmId: 'user-new-dm',
};

describe('campaign.dm.transferred', () => {
  let client: typeof import('../socket').default;

  beforeEach(async () => {
    sockets.length = 0;
    vi.resetModules();
    client = (await import('../socket')).default;
  });

  it('subscribes under the exact event name the server broadcasts', async () => {
    await connect(client);

    const seen: DmTransferredBroadcast[] = [];
    client.onDmTransferred((data) => seen.push(data));

    current().fire('campaign.dm.transferred', transfer);

    expect(seen).toHaveLength(1);
    expect(seen[0].newDmId).toBe('user-new-dm');
    expect(seen[0].previousDmId).toBe('user-old-dm');
  });

  it('carries the whole payload through, including a null previous DM', async () => {
    await connect(client);

    const seen: DmTransferredBroadcast[] = [];
    client.onDmTransferred((data) => seen.push(data));

    // A campaign that somehow had no DM to demote still transfers.
    current().fire('campaign.dm.transferred', { ...transfer, previousDmId: null });

    expect(seen[0].previousDmId).toBeNull();
    expect(seen[0].newDmId).toBe('user-new-dm');
  });

  it('still fires after a reconnect builds a new socket', async () => {
    await connect(client);

    const seen: DmTransferredBroadcast[] = [];
    client.onDmTransferred((data) => seen.push(data));

    await connect(client);
    expect(sockets).toHaveLength(2);

    current().fire('campaign.dm.transferred', transfer);
    expect(seen).toHaveLength(1);
  });

  it('stops delivering once unsubscribed', async () => {
    await connect(client);

    const seen: DmTransferredBroadcast[] = [];
    const handler = (data: DmTransferredBroadcast) => seen.push(data);

    client.onDmTransferred(handler);
    client.off('campaign.dm.transferred', handler);

    current().fire('campaign.dm.transferred', transfer);
    expect(seen).toHaveLength(0);
  });
});
