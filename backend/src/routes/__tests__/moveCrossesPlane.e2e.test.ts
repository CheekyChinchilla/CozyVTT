/**
 * Moving a player's spirit token to another map moves the player between
 * planes, and their copy of the initiative order has to follow.
 *
 * A player is on the spirit plane while a visible spirit-layer token of
 * theirs stands on the map the table is showing. Moving that token away
 * brings them back to the material plane, which changes which combatants
 * they are sent. The move route sent the order again only when a moved
 * token was itself a combatant, so their tracker kept the spirit plane's.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { setState, clearState } from '../../websocket/initiativeState';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let shownId: string;
let otherId: string;
let dm: ReturnType<typeof request.agent>;
const SHADE = randomUUID();
const WRAITH = randomUUID();

const token = (id: string, extra: Record<string, unknown>) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'spirit',
  visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, type: 'npc', ...extra,
});

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `crossmove-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `crossmove-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Cross move ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const base = { campaignId, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x', width: 10, height: 10, gridSize: 50, annotations: [] };
  shownId = (await prisma.map.create({
    data: { ...base, name: 'Shown', tokens: [token(SHADE, { controlledBy: playerId, type: 'player' }), token(WRAITH, { position: { x: 3, y: 3 } })] },
  })).id;
  otherId = (await prisma.map.create({ data: { ...base, name: 'Elsewhere', tokens: [] } })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId, spiritLayerEnabled: false } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  clearState(campaignId);
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it("sends the order again when a move takes a player's spirit token off the map", async () => {
  setState(campaignId, {
    active: true, round: 1, currentTokenId: null,
    combatants: [{ tokenId: WRAITH, mapId: shownId, name: 'Wraith', imageUrl: '', initiative: 12, hp: null, type: 'npc', disposition: null }],
  });
  const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  // Crossed over, the player is sent the wraith; back on the material plane, not.
  const back = new Promise<void>((resolve) => {
    player.on('initiative.state', (state: { combatants: Array<{ tokenId: string }> }) => {
      if (!state.combatants.some((c) => c.tokenId === WRAITH)) resolve();
    });
  });

  const res = await dm.post(`/api/campaigns/${campaignId}/maps/${shownId}/tokens/move`).send({ tokenIds: [SHADE], targetMapId: otherId });
  expect(res.status).toBe(200);
  await expect(Promise.race([back, new Promise((_r, reject) => setTimeout(() => reject(new Error('order not sent again')), 3000))])).resolves.toBeUndefined();
  player.disconnect();
});

// Placing such a token, or deleting it, moves the player between planes the
// same way; neither route sent the order again unless the token itself was
// in it.
describe('placing or deleting a player\'s spirit token', () => {
  const combat = () => setState(campaignId, {
    active: true, round: 1, currentTokenId: null,
    combatants: [{ tokenId: WRAITH, mapId: shownId, name: 'Wraith', imageUrl: '', initiative: 12, hp: null, type: 'npc', disposition: null }],
  });
  /** Resolves when the player is sent an order that does, or does not, list the wraith. */
  const orderFor = (player: import('socket.io-client').Socket, withWraith: boolean) => Promise.race([
    new Promise<void>((resolve) => {
      player.on('initiative.state', (state: { combatants: Array<{ tokenId: string }> }) => {
        if (state.combatants.some((c) => c.tokenId === WRAITH) === withWraith) resolve();
      });
    }),
    new Promise<void>((_r, reject) => setTimeout(() => reject(new Error('order not sent again')), 3000)),
  ]);

  it('sends the order again when the token is deleted', async () => {
    await prisma.map.update({ where: { id: shownId }, data: { tokens: [token(SHADE, { controlledBy: playerId, type: 'player' }), token(WRAITH, { position: { x: 3, y: 3 } })] } });
    combat();
    const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const back = orderFor(player, false);
    expect((await dm.delete(`/api/campaigns/${campaignId}/maps/${shownId}/tokens/${SHADE}`)).status).toBe(200);
    await expect(back).resolves.toBeUndefined();
    player.disconnect();
  });

  it('sends the order again when the token is placed', async () => {
    await prisma.map.update({ where: { id: shownId }, data: { tokens: [token(WRAITH, { position: { x: 3, y: 3 } })] } });
    combat();
    const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const across = orderFor(player, true);
    const res = await dm.post(`/api/campaigns/${campaignId}/maps/${shownId}/tokens`)
      .send({ name: 'Shade', position: { x: 2, y: 2 }, layer: 'spirit', controlledBy: playerId, type: 'player' });
    expect(res.status).toBe(201);
    await expect(across).resolves.toBeUndefined();
    player.disconnect();
  });

  // A spirit-plane token handed to a player takes them across with it.
  it('sends the order again when the token is handed to them', async () => {
    await prisma.map.update({ where: { id: shownId }, data: { tokens: [token(SHADE, { type: 'player' }), token(WRAITH, { position: { x: 3, y: 3 } })] } });
    combat();
    const player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const across = orderFor(player, true);
    const res = await dm.put(`/api/campaigns/${campaignId}/maps/${shownId}/tokens/${SHADE}`).send({ controlledBy: playerId });
    expect(res.status).toBe(200);
    await expect(across).resolves.toBeUndefined();
    player.disconnect();
  });
});
