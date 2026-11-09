/**
 * Deleting a campaign reaches the connections still on it.
 *
 * The row and its memberships go in one cascade, but the sockets that had
 * authenticated into the campaign kept its id and role and stayed in its
 * room: they could still relay pings to each other, every write they tried
 * failed against the missing row, and the campaign's combat state stayed in
 * memory. Each is now told the campaign was deleted and dropped from it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';
import { getState, setState } from '../../websocket/initiativeState';

jest.setTimeout(20000);

const app = createTestApp();
let server: WsTestServer;
let ownerId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let owner: ReturnType<typeof request.agent>;
let ownerCookie: string;
let playerCookie: string;

beforeAll(async () => {
  const stamp = Date.now();
  const ownerUser = await createTestUser({ email: `del-owner-${stamp}@test.cozyvtt.local`, displayName: 'Owner' });
  const playerUser = await createTestUser({ email: `del-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  ownerId = ownerUser.id;
  playerId = playerUser.id;
  const campaign = await createTestCampaign(ownerId, { name: `Doomed ${stamp}` });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ownerId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Doomed Map', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 8, height: 8, gridSize: 50, annotations: [], tokens: [],
    },
  });
  mapId = map.id;
  // Pings on the map the table is on reach players.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  owner = request.agent(app);
  expect((await owner.post('/api/auth/login').send({ email: ownerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
  [ownerCookie, playerCookie] = await Promise.all([server.loginAs(ownerId), server.loginAs(playerId)]);
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await cleanupUsers([ownerId, playerId]);
  await prisma.$disconnect();
});

describe('DELETE /api/campaigns/:campaignId with members connected', () => {
  it('tells every connection the campaign was deleted, cuts them off from each other, forgets its combat state, and takes what was drawn on its maps', async () => {
    const dm = await server.connectAndAuth(ownerCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    // Live before: a ping crosses the room, and combat state exists.
    const crossed = waitForEvent(player, 'map.pinged');
    dm.emit('map.ping', { mapId, x: 1, y: 1 });
    await expect(crossed).resolves.toMatchObject({ x: 1, y: 1 });
    setState(campaignId, { active: true, round: 3, currentTokenId: null, combatants: [] });
    const drawing = await prisma.mapDrawing.create({
      data: { mapId, authorId: playerId, kind: 'line', color: '#e8a33c', width: 2, points: [[0, 0], [40, 40]] },
    });

    const told = { campaignId, reason: 'campaign-deleted', message: 'This campaign was deleted.' };
    const dmTold = waitForEvent(dm, 'campaign.access.revoked');
    const playerTold = waitForEvent(player, 'campaign.access.revoked');
    const res = await owner.delete(`/api/campaigns/${campaignId}`);
    expect(res.status).toBe(200);
    await expect(dmTold).resolves.toEqual(told);
    await expect(playerTold).resolves.toEqual(told);

    // Dead after: nothing crosses, and the state is gone.
    const silence = expectNoEvent(player, 'map.pinged', 500);
    dm.emit('map.ping', { mapId, x: 2, y: 2 });
    await expect(silence).resolves.toBeUndefined();
    expect(getState(campaignId).active).toBe(false);
    expect(getState(campaignId).round).toBe(0);
    // The campaign's maps went with it, and what was drawn on them.
    expect(await prisma.mapDrawing.findUnique({ where: { id: drawing.id } })).toBeNull();

    dm.disconnect();
    player.disconnect();
  });
});
