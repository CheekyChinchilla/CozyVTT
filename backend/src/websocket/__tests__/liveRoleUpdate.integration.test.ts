/**
 * A role change reaching a connection that is already open.
 *
 * `socket.role` is read once, when the socket authenticates to a campaign, and
 * every DM-gated handler trusts it from then on. That is the correct place to
 * read it — a handler must never take a role off the wire — but it makes the
 * value a snapshot, and a snapshot goes stale the moment the DM seat moves.
 *
 * Stale in the dangerous direction: without intervention the outgoing DM keeps
 * DM powers over their open connection until they happen to reload, and the
 * incoming DM cannot use theirs. REST has no such gap, because its middleware
 * reads the membership per request.
 *
 * These tests drive the real socket server and assert on the same connection
 * before and after — a reconnect would prove nothing, since a fresh socket picks
 * up the new role anyway.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { applyRoleToLiveSockets, broadcastToCampaign } from '../utils';
import * as utils from '../utils';
import * as auth from '../auth';
import type { AuthenticatedSocket } from '../auth';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `liverole-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dmCookie: string;
let playerCookie: string;

/** Ask a socket to clear roll history; resolve with what came back. */
function attemptClear(client: ClientSocket): Promise<'allowed' | 'refused'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('neither outcome within 5s')), 5000);
    const done = (outcome: 'allowed' | 'refused') => {
      clearTimeout(timer);
      client.off('dice.historyCleared', onCleared);
      client.off('error', onError);
      resolve(outcome);
    };
    const onCleared = () => done('allowed');
    const onError = () => done('refused');
    client.once('dice.historyCleared', onCleared);
    client.once('error', onError);
    client.emit('dice.clearHistory');
  });
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Liverole ${name}`,
        },
      })
    )
  );
  dmId = dm.id;
  playerId = player.id;

  const campaign = await prisma.campaign.create({
    data: { name: `Live Role Campaign ${runId}`, ownerId: dmId, vibeSettings: {} },
  });
  campaignId = campaign.id;

  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([
    server.loginAs(dmId),
    server.loginAs(playerId),
  ]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { rollHistoryClearedAt: null },
  });
});

describe('applyRoleToLiveSockets', () => {
  it('takes DM powers off an open connection without waiting for a reconnect', async () => {
    const dmClient = await server.connectAndAuth(dmCookie, campaignId);

    // Baseline: this connection really does hold DM powers.
    expect(await attemptClear(dmClient)).toBe('allowed');

    await applyRoleToLiveSockets(dmId, campaignId, 'PLAYER');

    // Same socket, never reconnected. This is the privilege leak.
    expect(await attemptClear(dmClient)).toBe('refused');
  });

  it('grants DM powers to an open connection that had none', async () => {
    const playerClient = await server.connectAndAuth(playerCookie, campaignId);

    expect(await attemptClear(playerClient)).toBe('refused');

    await applyRoleToLiveSockets(playerId, campaignId, 'DM');

    expect(await attemptClear(playerClient)).toBe('allowed');

    playerClient.disconnect();
  });

  it('touches nothing when the user has no connection open', async () => {
    // Somebody who has never connected, so the result cannot depend on whether
    // an earlier test left a socket lying around. Offline is the ordinary case
    // for a handover — most transfers happen between sessions — and it must be
    // a quiet no-op rather than an error.
    const neverConnected = randomUUID();
    expect(await applyRoleToLiveSockets(neverConnected, campaignId, 'DM')).toBe(0);
  });

  it('leaves the same user alone on a campaign they are not being changed in', async () => {
    const otherCampaign = await prisma.campaign.create({
      data: { name: `Other ${runId}`, ownerId: dmId, vibeSettings: {} },
    });
    await prisma.campaignMembership.create({
      data: { userId: dmId, campaignId: otherCampaign.id, role: 'DM', characterIds: [] },
    });

    const elsewhere = await server.connectAndAuth(dmCookie, otherCampaign.id);
    expect(await attemptClear(elsewhere)).toBe('allowed');

    // A handover in the first campaign must not disturb a tab open on another.
    await applyRoleToLiveSockets(dmId, campaignId, 'PLAYER');
    expect(await attemptClear(elsewhere)).toBe('allowed');

    elsewhere.disconnect();
    await prisma.campaign.deleteMany({ where: { id: otherCampaign.id } });
  });
});

describe('campaign.dm.transferred', () => {
  it('reaches everyone in the campaign so open clients can re-derive their role', async () => {
    const dmClient = await server.connectAndAuth(dmCookie, campaignId);
    const playerClient = await server.connectAndAuth(playerCookie, campaignId);

    const heard = Promise.all([
      waitForEvent<{ newDmId: string; previousDmId: string | null }>(
        dmClient,
        'campaign.dm.transferred'
      ),
      waitForEvent<{ newDmId: string }>(playerClient, 'campaign.dm.transferred'),
    ]);

    broadcastToCampaign(campaignId, 'campaign.dm.transferred', {
      campaignId,
      previousDmId: dmId,
      newDmId: playerId,
    });

    const [onDm, onPlayer] = await heard;
    expect(onDm.newDmId).toBe(playerId);
    expect(onDm.previousDmId).toBe(dmId);
    expect(onPlayer.newDmId).toBe(playerId);

    dmClient.disconnect();
    playerClient.disconnect();
  });
});

/**
 * A change made while a socket is switching campaigns. `authenticate` read
 * the membership, then awaited leaving the old campaign and telling it who
 * was online, and only then took the new campaign's room and role. A removal
 * or a role change in that gap found the socket outside the new room, so it
 * was missed, and the socket joined with what it had read.
 */
describe('a change while a connection switches campaigns', () => {
  let campaignA: string;
  let campaignB: string;

  beforeEach(async () => {
    const [a, b] = await Promise.all(
      ['A', 'B'].map((label) => prisma.campaign.create({ data: { name: `Switch ${label} ${runId}`, ownerId: dmId, vibeSettings: {} } }))
    );
    campaignA = a.id;
    campaignB = b.id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: playerId, campaignId: campaignA, role: 'PLAYER', characterIds: [] },
        { userId: playerId, campaignId: campaignB, role: 'DM', characterIds: [] },
      ],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.campaign.deleteMany({ where: { id: { in: [campaignA, campaignB] } } });
  });

  /** The server's socket for a client. */
  function serverSocket(client: ClientSocket): AuthenticatedSocket {
    const found = server.io.of('/').sockets.get(client.id ?? '');
    if (!found) throw new Error('no server socket for the client');
    return found as AuthenticatedSocket;
  }

  /** Switch to B and wait until the server has finished with it, `authenticated` or not. */
  async function switchToB(client: ClientSocket): Promise<AuthenticatedSocket> {
    const socket = serverSocket(client);
    client.emit('authenticate', { campaignId: campaignB });
    // The event has to arrive before the chain it joins can be awaited.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await socket.authenticating;
    return socket;
  }

  it("leaves the connection out of a campaign it was removed from during the old campaign's presence broadcast", async () => {
    const client = await server.connectAndAuth(playerCookie, campaignA);
    const original = utils.broadcastPresence;
    jest.spyOn(utils, 'broadcastPresence').mockImplementation(async (room: string) => {
      if (room === campaignA) {
        // What removing a member does: the row, then the live sockets.
        await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: playerId, campaignId: campaignB } } });
        await utils.clearCampaignFromLiveSockets(playerId, campaignB);
      }
      return original(room);
    });

    const socket = await switchToB(client);
    expect(socket.rooms.has(campaignB)).toBe(false);
    expect(socket.campaignId).toBeUndefined();
    expect(socket.role).toBeUndefined();
    client.disconnect();
  });

  it("takes the role a demotion during the old campaign's presence broadcast gave", async () => {
    const client = await server.connectAndAuth(playerCookie, campaignA);
    const original = utils.broadcastPresence;
    jest.spyOn(utils, 'broadcastPresence').mockImplementation(async (room: string) => {
      if (room === campaignA) {
        await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId: campaignB } }, data: { role: 'PLAYER' } });
        await utils.applyRoleToLiveSockets(playerId, campaignB, 'PLAYER');
      }
      return original(room);
    });

    const socket = await switchToB(client);
    expect(socket.campaignId).toBe(campaignB);
    expect(socket.role).toBe('PLAYER');
    client.disconnect();
  });

  // The second read ran after `authenticated` was sent, and after the
  // presence broadcast, so a client asking for state as soon as it was told
  // it had joined was answered with the role read before the demotion.
  it('settles the role before saying the connection has joined, so a state request at once is answered with it', async () => {
    const prepared = await prisma.map.create({
      data: {
        campaignId: campaignB, name: 'Prepared', imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50,
        tokens: [], annotations: [], wallSegments: [{ id: randomUUID(), x1: 0, y1: 0, x2: 5, y2: 0, type: 'wall' }],
      },
    });
    const original = auth.authenticateCampaign;
    jest.spyOn(auth, 'authenticateCampaign').mockImplementation(async (s, id) => {
      const result = await original(s, id);
      // Demoted after the read: the route's live update finds no socket in the room yet.
      if (id === campaignB) {
        await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId: campaignB } }, data: { role: 'PLAYER' } });
        await applyRoleToLiveSockets(playerId, campaignB, 'PLAYER');
      }
      return result;
    });
    // The presence broadcast after joining takes its time, as it can on a busy server.
    const presence = utils.broadcastPresence;
    jest.spyOn(utils, 'broadcastPresence').mockImplementation(async (room: string) => {
      if (room === campaignB) await new Promise((resolve) => setTimeout(resolve, 300));
      return presence(room);
    });

    const client = await server.connectClient(playerCookie);
    const joined = new Promise<{ role: string }>((resolve) => {
      client.once('authenticated', (data: { role: string }) => {
        // A prepared map's walls go to the DM alone.
        client.emit('walls:request', { mapId: prepared.id });
        resolve(data);
      });
    });
    const noWalls = expectNoEvent(client, 'walls:replaced', 800);
    client.emit('authenticate', { campaignId: campaignB });

    expect((await joined).role).toBe('PLAYER');
    await expect(noWalls).resolves.toBeUndefined();
    expect(serverSocket(client).role).toBe('PLAYER');
    client.disconnect();
  });

  it('reads the membership again, for a removal whose live clear-out ran before the connection joined', async () => {
    const client = await server.connectAndAuth(playerCookie, campaignA);
    const original = auth.authenticateCampaign;
    jest.spyOn(auth, 'authenticateCampaign').mockImplementation(async (s, id) => {
      const result = await original(s, id);
      // Removed after the read: the route's clear-out finds nothing to clear yet.
      if (id === campaignB) {
        await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: playerId, campaignId: campaignB } } });
        await utils.clearCampaignFromLiveSockets(playerId, campaignB);
      }
      return result;
    });

    const revoked = waitForEvent<{ campaignId: string; reason: string }>(client, 'campaign.access.revoked');
    const socket = await switchToB(client);
    expect(socket.rooms.has(campaignB)).toBe(false);
    expect(socket.campaignId).toBeUndefined();
    await expect(revoked).resolves.toMatchObject({ campaignId: campaignB, reason: 'removed' });
    client.disconnect();
  });
});
