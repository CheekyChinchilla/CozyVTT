/**
 * The live table takes the GM's value versions before 1.7.0 sent, from a
 * browser tab opened before the upgrade or a script made for one, and
 * answers with the new: a chat message's type, and a drawing's audience in
 * an add and a preview. A hand-over of the GM's seat is sent under the
 * event's new name and its old one, each with the new fields and the old.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { AckAnswer } from '../../websocket/ack';
import { LEGACY_GM } from '../gameSystemAliases';

jest.setTimeout(60_000);

const app = createTestApp();
let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let gmRest: ReturnType<typeof request.agent>;

function ask(client: ClientSocket, event: string, payload: unknown): Promise<AckAnswer> {
  return client.timeout(5000).emitWithAck(event, payload) as Promise<AckAnswer>;
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const gmUser = await createTestUser({ email: `old-values-gm-${stamp}@test.cozyvtt.local`, displayName: 'GM' });
  const playerUser = await createTestUser({ email: `old-values-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  gmId = gmUser.id;
  playerId = playerUser.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Old values ${stamp}`, ownerId: gmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Shown', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, gridSize: 50, tokens: [], annotations: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  gmRest = request.agent(app);
  expect((await gmRest.post('/api/auth/login').send({ email: gmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([gmId, playerId]);
  await prisma.$disconnect();
});

it('marks the GM\'s message GM when it asks for the old type', async () => {
  const gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  try {
    const heard = waitForEvent<{ id: string; type: string }>(player, 'chat.message');
    gm.emit('chat.message', { content: 'The lantern gutters.', type: LEGACY_GM });
    const message = await heard;
    expect(message.type).toBe('GM');
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).type).toBe('GM');
  } finally {
    gm.disconnect();
    player.disconnect();
  }
});

it('stores a drawing for the GM alone when it asks for the old audience', async () => {
  const gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  try {
    const drawing = { kind: 'line', color: '#3d8bd9', width: 4, points: [[10, 10], [200, 120]], audience: LEGACY_GM };
    const added = await ask(gm, 'drawing:add', { mapId, drawing });
    if (!added.ok) throw new Error(`refused: ${added.error}`);
    expect((await prisma.mapDrawing.findUniqueOrThrow({ where: { id: String(added.id) } })).audience).toBe('GM');
  } finally {
    gm.disconnect();
  }
});

it('shows the GM\'s other pages, and no player, a preview for the GM alone sent with the old audience', async () => {
  const gm = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  const gmElsewhere = await server.connectAndAuth(await server.loginAs(gmId), campaignId);
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  try {
    const toPlayer: unknown[] = [];
    player.on('drawing:previewed', (frame: unknown) => toPlayer.push(frame));
    const heard = waitForEvent<{ preview: { audience: string } }>(gmElsewhere, 'drawing:previewed');
    gm.emit('drawing:preview', { mapId, preview: { previewId: 'old-tab', kind: 'line', color: '#3d8bd9', width: 4, audience: LEGACY_GM, points: [[1, 1]] } });
    expect((await heard).preview.audience).toBe('GM');
    expect(toPlayer).toEqual([]);
  } finally {
    gm.disconnect();
    gmElsewhere.disconnect();
    player.disconnect();
  }
});

it('sends a hand-over of the GM\'s seat under the event\'s new name and its old one, each with both sets of fields', async () => {
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  try {
    const asNew = waitForEvent<Record<string, unknown>>(player, 'campaign.gm.transferred');
    const asOld = waitForEvent<Record<string, unknown>>(player, 'campaign.dm.transferred');

    expect((await gmRest.put(`/api/campaigns/${campaignId}/gm`).send({ userId: playerId })).status).toBe(200);

    const sent = { campaignId, previousGmId: gmId, newGmId: playerId, previousDmId: gmId, newDmId: playerId };
    expect(await asNew).toEqual(sent);
    expect(await asOld).toEqual(sent);
  } finally {
    player.disconnect();
  }
});
