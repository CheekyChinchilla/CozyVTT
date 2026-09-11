/**
 * Who is allowed to clear a campaign's dice roll history.
 *
 * The handler is documented as DM-only, but it decided by comparing the caller
 * against `Campaign.ownerId` — which is a different fact from
 * `CampaignMembership.role`. The two are the same person in every campaign
 * created the ordinary way, so the difference never showed. It shows the moment
 * the DM seat moves: the person actually running the game is refused, and the
 * original owner, now a player, can still wipe the panel for everyone.
 *
 * `campaigns.ts` already reads the role from the membership for exactly this
 * reason, noting that "a co-DM by membership is a DM here too". These tests pin
 * the two down to the same answer.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `clearhist-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let ownerId: string;
let dmId: string;
let campaignId: string;
let ownerCookie: string;
let dmCookie: string;

beforeAll(async () => {
  // Two distinct people: one holds the campaign, the other runs it. This is the
  // state a DM handover leaves behind, and it is legal today — nothing requires
  // the owner to be the DM.
  const [owner, dm] = await Promise.all(
    ['owner', 'dm'].map((name) =>
      prisma.user.create({
        data: {
          email: email(name),
          passwordHash: 'not-used-by-socket-auth',
          displayName: `Clearhist ${name}`,
        },
      })
    )
  );
  ownerId = owner.id;
  dmId = dm.id;

  const campaign = await prisma.campaign.create({
    data: {
      name: `Clear History Campaign ${runId}`,
      ownerId,
      vibeSettings: {},
    },
  });
  campaignId = campaign.id;

  await prisma.campaignMembership.createMany({
    data: [
      // The owner sits at the table as an ordinary player.
      { userId: ownerId, campaignId, role: 'PLAYER', characterIds: [] },
      // Somebody else runs the game.
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
    ],
  });

  server = await createWsTestServer();
  [ownerCookie, dmCookie] = await Promise.all([
    server.loginAs(ownerId),
    server.loginAs(dmId),
  ]);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, dmId] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { rollHistoryClearedAt: null },
  });
});

describe('dice.clearHistory decides from the membership role', () => {
  it('lets the DM clear the history even though someone else owns the campaign', async () => {
    const client: ClientSocket = await server.connectAndAuth(dmCookie, campaignId);

    const cleared = waitForEvent(client, 'dice.historyCleared');
    client.emit('dice.clearHistory');
    await cleared;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { rollHistoryClearedAt: true },
    });
    expect(campaign?.rollHistoryClearedAt).toBeInstanceOf(Date);
  });

  it('refuses the owner once they are only a player', async () => {
    const client: ClientSocket = await server.connectAndAuth(ownerCookie, campaignId);

    const refusal = await new Promise<{ message: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no error emitted')), 5000);
      client.once('error', (err: { message: string }) => {
        clearTimeout(timer);
        resolve(err);
      });
      client.emit('dice.clearHistory');
    });

    expect(refusal.message).toMatch(/only the dm/i);

    // The refusal must be real, not just a message — nothing may be written.
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { rollHistoryClearedAt: true },
    });
    expect(campaign?.rollHistoryClearedAt).toBeNull();
  });
});
