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
import { applyRoleToLiveSockets } from '../utils';
import {
  createWsTestServer,
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

    const { broadcastToCampaign } = await import('../utils');
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
