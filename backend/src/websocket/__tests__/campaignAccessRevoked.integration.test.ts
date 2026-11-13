/**
 * Removing someone from a campaign reaching a connection that is already open.
 *
 * A socket reads its campaign and role once, when it authenticates, and every
 * handler trusts that from then on. Changing the GM seat already pushed the new
 * role to live connections. Removing a member did not, so a player the GM had
 * just removed kept sending chat and dice and kept receiving everything the
 * table did, for as long as they left the tab open.
 *
 * These drive the real socket server and assert on the same connection before
 * and after. A reconnect would prove nothing, because a fresh socket is
 * refused at authentication anyway.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { clearCampaignFromLiveSockets, type AccessRevoked, type AccessRevokedReason } from '../utils';
import type { AuthenticatedSocket } from '../auth';
import { takeMemberOut, tellTableMemberLeft } from '../../services/campaignMembers';
import { DEPARTURE_MEMORY_MS, whyNotAMember } from '../memberDepartures';
import * as serializable from '../../utils/serializable';
import {
  createWsTestServer,
  waitForEvent,
  expectNoEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `revoked-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let gmId: string;
let playerId: string;
let outsiderId: string;
let campaignId: string;
let otherCampaignId: string;
let gmCookie: string;
let playerCookie: string;
let outsiderCookie: string;

/** Try to speak in the campaign; resolve with what came back. */
function attemptChat(client: ClientSocket, content: string): Promise<'sent' | 'refused'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('neither outcome within 5s')), 5000);
    const done = (outcome: 'sent' | 'refused') => {
      clearTimeout(timer);
      client.off('chat.message', onSent);
      client.off('error', onError);
      resolve(outcome);
    };
    const onSent = () => done('sent');
    const onError = () => done('refused');
    client.once('chat.message', onSent);
    client.once('error', onError);
    client.emit('chat.message', { content, type: 'PLAYER' });
  });
}

beforeAll(async () => {
  const [gm, player, outsider] = await Promise.all(
    ['dm', 'player', 'outsider'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Revoked ${name}`,
        },
      })
    )
  );
  gmId = gm.id;
  playerId = player.id;
  outsiderId = outsider.id;

  const [campaign, other] = await Promise.all([
    prisma.campaign.create({ data: { name: `Revoked Campaign ${runId}`, ownerId: gmId, vibeSettings: {} } }),
    prisma.campaign.create({ data: { name: `Other Campaign ${runId}`, ownerId: playerId, vibeSettings: {} } }),
  ]);
  campaignId = campaign.id;
  otherCampaignId = other.id;

  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId: otherCampaignId, role: 'GM', characterIds: [] },
    ],
  });

  server = await createWsTestServer();
  [gmCookie, playerCookie, outsiderCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(playerId), server.loginAs(outsiderId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId, outsiderId] } } });
  await prisma.$disconnect();
});

describe('clearCampaignFromLiveSockets', () => {
  it('stops an open connection speaking in a campaign it was removed from', async () => {
    const playerClient = await server.connectAndAuth(playerCookie, campaignId);

    // Baseline: this connection really can speak.
    expect(await attemptChat(playerClient, 'still a member')).toBe('sent');

    await clearCampaignFromLiveSockets(playerId, campaignId);

    // Same socket, never reconnected.
    expect(await attemptChat(playerClient, 'removed by now')).toBe('refused');

    playerClient.disconnect();
  });

  it('stops it hearing what the table says', async () => {
    const playerClient = await server.connectAndAuth(playerCookie, campaignId);
    const gmClient = await server.connectAndAuth(gmCookie, campaignId);

    const heard = waitForEvent(playerClient, 'chat.message');
    gmClient.emit('chat.message', { content: 'before removal', type: 'GM' });
    await expect(heard).resolves.toBeDefined();

    await clearCampaignFromLiveSockets(playerId, campaignId);

    const silence = expectNoEvent(playerClient, 'chat.message', 500);
    gmClient.emit('chat.message', { content: 'after removal', type: 'GM' });
    await expect(silence).resolves.toBeUndefined();

    playerClient.disconnect();
    gmClient.disconnect();
  });

  it('leaves a connection to another campaign alone', async () => {
    const elsewhere = await server.connectAndAuth(playerCookie, otherCampaignId);

    expect(await attemptChat(elsewhere, 'in my own game')).toBe('sent');

    await clearCampaignFromLiveSockets(playerId, campaignId);

    // The game they were removed from is not this one.
    expect(await attemptChat(elsewhere, 'still in my own game')).toBe('sent');

    elsewhere.disconnect();
  });

  // The connection stays open, so nothing else would tell the page: it used
  // to get a plain 'error' that only an open Dice tab showed.
  it('tells the connection why, with campaign.access.revoked', async () => {
    const playerClient = await server.connectAndAuth(playerCookie, campaignId);
    const elsewhere = await server.connectAndAuth(playerCookie, otherCampaignId);

    const told = waitForEvent<AccessRevoked>(playerClient, 'campaign.access.revoked');
    const notTold = expectNoEvent(elsewhere, 'campaign.access.revoked', 500);
    await clearCampaignFromLiveSockets(playerId, campaignId);

    await expect(told).resolves.toEqual({ campaignId, reason: 'removed', message: 'You were removed from this campaign.' });
    await expect(notTold).resolves.toBeUndefined();

    playerClient.disconnect();
    elsewhere.disconnect();
  });

  it('is a quiet no-op when the user has no connection open', async () => {
    const neverConnected = randomUUID();
    expect(await clearCampaignFromLiveSockets(neverConnected, campaignId)).toBe(0);
  });
});

/**
 * A join the server refuses because the campaign is gone or the user is not
 * in it: a tab that reconnects after its member was removed or left, or
 * after the campaign was deleted (a computer that slept through it), or an
 * address the user was never in. It used to get a plain `error`, and the
 * page stayed on a table it could not use.
 */
describe('a refused join', () => {
  /** The server's socket for a client. */
  function serverSocket(client: ClientSocket): AuthenticatedSocket {
    const found = server.io.of('/').sockets.get(client.id ?? '');
    if (!found) throw new Error('no server socket for the client');
    return found as AuthenticatedSocket;
  }

  /** Rooms other than the socket's own and its user's: the campaign rooms it is in. */
  function campaignRooms(client: ClientSocket, userId: string): string[] {
    const socket = serverSocket(client);
    return [...socket.rooms].filter((room) => room !== socket.id && room !== userId);
  }

  it('tells someone who is not a member, with no plain error and nothing about the campaign', async () => {
    const client = await server.connectClient(outsiderCookie);
    const told = waitForEvent<AccessRevoked>(client, 'campaign.access.revoked');
    const noError = expectNoEvent(client, 'error', 500);
    client.emit('authenticate', { campaignId });

    const revoked = await told;
    expect(revoked).toEqual({ campaignId, reason: 'not-member', message: 'You are not a member of this campaign.' });
    expect(JSON.stringify(revoked)).not.toContain('Revoked Campaign');
    await expect(noError).resolves.toBeUndefined();
    expect(campaignRooms(client, outsiderId)).toEqual([]);
    expect(serverSocket(client).campaignId).toBeUndefined();
    client.disconnect();
  });

  it('tells a connection asking for a campaign that does not exist', async () => {
    const client = await server.connectClient(outsiderCookie);
    const gone = randomUUID();
    const told = waitForEvent<AccessRevoked>(client, 'campaign.access.revoked');
    const noError = expectNoEvent(client, 'error', 500);
    client.emit('authenticate', { campaignId: gone });

    await expect(told).resolves.toEqual({
      campaignId: gone,
      reason: 'campaign-deleted',
      message: 'This campaign does not exist. It may have been deleted.',
    });
    await expect(noError).resolves.toBeUndefined();
    expect(campaignRooms(client, outsiderId)).toEqual([]);
    client.disconnect();
  });

  // A membership gone with the socket still in the room: its live clear-out
  // did not reach it. Joining again takes it out.
  it('takes a connection out of the room of a campaign it is no longer in', async () => {
    const client = await server.connectAndAuth(playerCookie, otherCampaignId);
    await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: playerId, campaignId: otherCampaignId } } });
    try {
      const told = waitForEvent<AccessRevoked>(client, 'campaign.access.revoked');
      client.emit('authenticate', { campaignId: otherCampaignId });

      await expect(told).resolves.toMatchObject({ campaignId: otherCampaignId, reason: 'not-member' });
      expect(campaignRooms(client, playerId)).toEqual([]);
      expect(serverSocket(client).campaignId).toBeUndefined();
      expect(serverSocket(client).role).toBeUndefined();
      expect(await attemptChat(client, 'not in it any more')).toBe('refused');
    } finally {
      await prisma.campaignMembership.create({ data: { userId: playerId, campaignId: otherCampaignId, role: 'GM', characterIds: [] } });
      client.disconnect();
    }
  });

  // A computer that slept through the removal: its tab reconnects and asks
  // to join again. Told the removal while it is recent, and after that only
  // that the user is not a member.
  describe('a connection coming back after its member was removed', () => {
    beforeEach(async () => {
      // What the GM's Remove does.
      expect(await takeMemberOut(campaignId, playerId, 'removed')).toBeNull();
      await tellTableMemberLeft(playerId, campaignId, 'removed');
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await prisma.campaignMembership.create({ data: { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] } });
    });

    it('is told it was removed, within the minute', async () => {
      const client = await server.connectClient(playerCookie);
      const told = waitForEvent<AccessRevoked>(client, 'campaign.access.revoked');
      client.emit('authenticate', { campaignId });

      await expect(told).resolves.toEqual({ campaignId, reason: 'removed', message: 'You were removed from this campaign.' });
      expect(campaignRooms(client, playerId)).toEqual([]);
      client.disconnect();
    });

    it('is told it is not a member, once the minute has passed', async () => {
      const later = Date.now() + DEPARTURE_MEMORY_MS;
      jest.spyOn(Date, 'now').mockReturnValue(later);
      const client = await server.connectClient(playerCookie);
      const told = waitForEvent<AccessRevoked>(client, 'campaign.access.revoked');
      client.emit('authenticate', { campaignId });

      await expect(told).resolves.toEqual({ campaignId, reason: 'not-member', message: 'You are not a member of this campaign.' });
      expect(campaignRooms(client, playerId)).toEqual([]);
      client.disconnect();
    });
  });
});

/**
 * A leave or a removal records why before its delete is committed. A join
 * whose membership read lands between the commit and the route telling the
 * table finds the membership gone, and must find the reason too.
 */
describe('taking a member out', () => {
  let freshCampaignId: string;

  beforeEach(async () => {
    // A campaign of its own each time: a record left by another test would
    // answer for this one.
    const fresh = await prisma.campaign.create({ data: { name: `Departure ${runId}`, ownerId: gmId, vibeSettings: {} } });
    freshCampaignId = fresh.id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: gmId, campaignId: freshCampaignId, role: 'GM', characterIds: [] },
        { userId: playerId, campaignId: freshCampaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await prisma.campaign.delete({ where: { id: freshCampaignId } });
  });

  /** What a join would be told the moment the delete has committed, before the route goes on. */
  function toldAtCommit(): { reason: AccessRevokedReason | null } {
    const seen: { reason: AccessRevokedReason | null } = { reason: null };
    const real = serializable.inSerializableTransaction;
    jest.spyOn(serializable, 'inSerializableTransaction').mockImplementation(async (work, options) => {
      const result = await real(work, options);
      seen.reason = whyNotAMember(playerId, freshCampaignId);
      return result;
    });
    return seen;
  }

  it('has recorded a leave by the time it is committed', async () => {
    const seen = toldAtCommit();
    expect(await takeMemberOut(freshCampaignId, playerId, 'left')).toBeNull();
    expect(seen.reason).toBe('left');
  });

  it('has recorded a removal by the time it is committed', async () => {
    const seen = toldAtCommit();
    expect(await takeMemberOut(freshCampaignId, playerId, 'removed')).toBeNull();
    expect(seen.reason).toBe('removed');
  });
});
