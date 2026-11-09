/**
 * Players may draw, the campaign setting that lets players draw on the map.
 *
 * The DM turns it on or off with `PUT /api/campaigns/:campaignId`; a player
 * cannot. Every member's page is told with `campaign.settings.updated`, as
 * for the other settings the table shows, and a player's next stroke is
 * refused once it is off: an add at once, a preview within a second.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { DRAW_SETTING_REFUSAL } from '../../utils/drawingRules';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmRest: ReturnType<typeof request.agent>;
let playerRest: ReturnType<typeof request.agent>;
let player: ClientSocket;
let dm: ClientSocket;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const line = { kind: 'line', color: '#3d8bd9', width: 3, points: [[0, 0], [40, 40]] };
const frame = (previewId: string) => ({ mapId, preview: { previewId, kind: 'pen', color: '#3d8bd9', width: 3, points: [[1, 1]] } });

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `may-draw-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `may-draw-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Players may draw ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Sketch', imageUrl: '', baseLayerUrl: '', width: 10, height: 10, tokens: [], annotations: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId, status: 'ACTIVE' } });
  dmRest = request.agent(app);
  expect((await dmRest.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  playerRest = request.agent(app);
  expect((await playerRest.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { playersMayDraw: true } });
  player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  dm = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
});

afterEach(() => {
  player.disconnect();
  dm.disconnect();
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

const stored = async () => (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).playersMayDraw;

it('is turned off by the DM, sent to every member, and answered in the campaign', async () => {
  const told = waitForEvent<{ campaignId: string; playersMayDraw: boolean }>(player, 'campaign.settings.updated');
  const res = await dmRest.put(`/api/campaigns/${campaignId}`).send({ playersMayDraw: false });
  expect(res.status).toBe(200);
  expect(res.body.campaign.playersMayDraw).toBe(false);
  expect(await told).toMatchObject({ campaignId, playersMayDraw: false });
  expect(await stored()).toBe(false);
});

it('is sent with the other settings when only they change', async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { playersMayDraw: false } });
  const told = waitForEvent<{ playersMayDraw: boolean }>(player, 'campaign.settings.updated');
  expect((await dmRest.put(`/api/campaigns/${campaignId}`).send({ chatCooldownEnabled: false })).status).toBe(200);
  expect((await told).playersMayDraw).toBe(false);
});

it('refuses a player\'s next drawing once it is off, and a preview within a second', async () => {
  const before = await player.timeout(5000).emitWithAck('drawing:add', { mapId, drawing: line });
  expect(before).toMatchObject({ ok: true });
  player.emit('drawing:preview', frame('before'));
  await waitForEvent(dm, 'drawing:previewed');

  expect((await dmRest.put(`/api/campaigns/${campaignId}`).send({ playersMayDraw: false })).status).toBe(200);
  expect(await player.timeout(5000).emitWithAck('drawing:add', { mapId, drawing: line })).toEqual({ ok: false, error: DRAW_SETTING_REFUSAL });
  await sleep(1100);
  const quiet = expectNoEvent(dm, 'drawing:previewed', 600);
  player.emit('drawing:preview', frame('before'));
  await quiet;

  // The DM still draws.
  expect(await dm.timeout(5000).emitWithAck('drawing:add', { mapId, drawing: line })).toMatchObject({ ok: true });
});

it('is not a player\'s to change', async () => {
  const quiet = expectNoEvent(player, 'campaign.settings.updated', 500);
  expect((await playerRest.put(`/api/campaigns/${campaignId}`).send({ playersMayDraw: false })).status).toBe(403);
  await quiet;
  expect(await stored()).toBe(true);
});

it.each([['a string', 'no'], ['a number', 0], ['null', null]])('refuses %s with a 400 that names the field', async (_what, value) => {
  const res = await dmRest.put(`/api/campaigns/${campaignId}`).send({ playersMayDraw: value });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Validation Error', message: 'playersMayDraw must be true or false' });
  expect(await stored()).toBe(true);
});
