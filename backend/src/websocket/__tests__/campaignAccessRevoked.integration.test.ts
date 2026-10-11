/**
 * Removing someone from a campaign reaching a connection that is already open.
 *
 * A socket reads its campaign and role once, when it authenticates, and every
 * handler trusts that from then on. Changing the DM seat already pushed the new
 * role to live connections. Removing a member did not, so a player the DM had
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
import { clearCampaignFromLiveSockets } from '../utils';
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
let dmId: string;
let playerId: string;
let campaignId: string;
let otherCampaignId: string;
let dmCookie: string;
let playerCookie: string;

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
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Revoked ${name}`,
        },
      })
    )
  );
  dmId = dm.id;
  playerId = player.id;

  const [campaign, other] = await Promise.all([
    prisma.campaign.create({ data: { name: `Revoked Campaign ${runId}`, ownerId: dmId, vibeSettings: {} } }),
    prisma.campaign.create({ data: { name: `Other Campaign ${runId}`, ownerId: playerId, vibeSettings: {} } }),
  ]);
  campaignId = campaign.id;
  otherCampaignId = other.id;

  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: playerId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });

  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
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
    const dmClient = await server.connectAndAuth(dmCookie, campaignId);

    const heard = waitForEvent(playerClient, 'chat.message');
    dmClient.emit('chat.message', { content: 'before removal', type: 'DM' });
    await expect(heard).resolves.toBeDefined();

    await clearCampaignFromLiveSockets(playerId, campaignId);

    const silence = expectNoEvent(playerClient, 'chat.message', 500);
    dmClient.emit('chat.message', { content: 'after removal', type: 'DM' });
    await expect(silence).resolves.toBeUndefined();

    playerClient.disconnect();
    dmClient.disconnect();
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

    const told = waitForEvent<{ campaignId: string | null; reason: string; message: string }>(playerClient, 'campaign.access.revoked');
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
