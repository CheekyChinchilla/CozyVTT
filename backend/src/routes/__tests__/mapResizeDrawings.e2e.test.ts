/**
 * Resizing a map in Edit Map takes its drawings with its picture.
 *
 * Walls and lights were already scaled with the picture when the map's
 * width, height or grid size changed; drawings stayed where they were, off
 * the art they were drawn on. Their points now scale across and down by the
 * map's own two changes, as walls do, and their widths by the mean of the
 * two, kept to 1 to 64 pixels; a point the stretch would take past the
 * region a map's drawings may reach is brought back to its edge. The whole
 * map is one statement, under the map's lock, so a map holding all the
 * drawing it can is resized well inside the transaction's time, and a
 * drawing write sent meanwhile waits its turn. Every open page is sent the
 * map's drawings again, each as its role may see them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import { resendDrawings } from '../../services/mapDrawings';
import { DRAWING_LIMITS } from '../../validators/drawings';

jest.setTimeout(60000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (done: () => boolean, timeoutMs = 3000) => {
  const until = Date.now() + timeoutMs;
  while (!done() && Date.now() < until) await sleep(20);
};

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `resize-draw-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `resize-draw-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Resize drawings ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  // 10 by 10 squares of 50 pixels: 500 by 500 pixels, and its drawings may
  // reach 500 squares (25,000 pixels) past each edge.
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Resized', imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, tokens: [], annotations: [] },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId, status: 'ACTIVE' } });
});

afterAll(async () => {
  await server.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

const draw = (points: number[][], extra: Record<string, unknown> = {}) =>
  prisma.mapDrawing.create({ data: { mapId, authorId: dmId, kind: 'pen', color: '#3d8bd9', width: 4, points, ...extra } });
const resize = (body: Record<string, unknown>) => dm.put(`/api/campaigns/${campaignId}/maps/${mapId}`).send(body);
const stored = (id: string) => prisma.mapDrawing.findUniqueOrThrow({ where: { id } });

it('stretches a drawing twice across and once down, and its width by the mean of the two', async () => {
  const drawing = await draw([[100, 50], [200, 150], [-30, 499]]);
  expect((await resize({ width: 20 })).status).toBe(200);
  const after = await stored(drawing.id);
  expect(after.points).toEqual([[200, 50], [400, 150], [-60, 499]]);
  expect(after.width).toBe(6);
});

it('scales with the grid size, both ways at once', async () => {
  const drawing = await draw([[100, 50], [201, 151]], { width: 3 });
  expect((await resize({ gridSize: 25 })).status).toBe(200);
  const after = await stored(drawing.id);
  // Halved, to whole pixels rounded as walls are: 100.5 becomes 101.
  expect(after.points).toEqual([[50, 25], [101, 76]]);
  expect(after.width).toBe(2);
});

it('keeps a width to 64 pixels, and to 1', async () => {
  const wide = await draw([[0, 0], [10, 10]], { width: 60 });
  const thin = await draw([[0, 0], [10, 10]], { width: 1 });
  expect((await resize({ width: 20, height: 20 })).status).toBe(200);
  expect((await stored(wide.id)).width).toBe(64);
  expect((await resize({ width: 2, height: 2 })).status).toBe(200);
  expect((await stored(thin.id)).width).toBe(1);
});

it('brings a point the stretch takes too far out back to the edge of the region', async () => {
  // 25,500 is the edge for 10 squares; doubled it would be 51,000, past
  // the 26,000 a map of 20 squares lets its drawings reach.
  const drawing = await draw([[25500, -25000], [0, 0]]);
  expect((await resize({ width: 20 })).status).toBe(200);
  expect((await stored(drawing.id)).points).toEqual([[26000, -25000], [0, 0]]);
});

it('leaves the drawings alone when the size stays the same', async () => {
  const drawing = await draw([[101, 51], [203, 155]], { width: 5 });
  expect((await resize({ name: 'Renamed', width: 10 })).status).toBe(200);
  expect(await stored(drawing.id)).toMatchObject({ points: [[101, 51], [203, 155]], width: 5 });
});

it('sends every open page the drawings again, each as its role may see them', async () => {
  const shared = await draw([[100, 100], [200, 200]]);
  const secret = await draw([[10, 10], [20, 20]], { audience: 'DM' });
  const dmSocket = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const playerSocket = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  type State = { mapId: string; drawings: Array<{ id: string; points: number[][] }> };
  const toDm = waitForEvent<State>(dmSocket, 'drawings:state');
  const toPlayer = waitForEvent<State>(playerSocket, 'drawings:state');
  expect((await resize({ width: 20, height: 20 })).status).toBe(200);
  const forDm = await toDm;
  const forPlayer = await toPlayer;
  expect(forDm.mapId).toBe(mapId);
  expect(forDm.drawings.map((d) => d.id).sort()).toEqual([shared.id, secret.id].sort());
  expect(forPlayer.drawings.map((d) => d.id)).toEqual([shared.id]);
  expect(forPlayer.drawings[0].points).toEqual([[200, 200], [400, 400]]);
  dmSocket.disconnect();
  playerSocket.disconnect();
});

// The list sent again is read, and sent, under the map's lock, so a drawing
// added or erased after it is read is sent after it, and never undone on a
// page by a list from before it.
it('sends the drawings again from under the map\'s lock, with what a write holding the lock adds', async () => {
  const before = await draw([[10, 10], [20, 20]]);
  const playerSocket = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const states: Array<{ drawings: Array<{ id: string }> }> = [];
  playerSocket.on('drawings:state', (state: { drawings: Array<{ id: string }> }) => states.push(state));
  let added = '';
  let resent: Promise<void> = Promise.resolve();
  await withMapsLocked([mapId], async (tx) => {
    resent = resendDrawings(campaignId, mapId);
    await expectNoEvent(playerSocket, 'drawings:state', 400);
    added = (await tx.mapDrawing.create({ data: { mapId, authorId: dmId, kind: 'line', color: '#1a1a1a', width: 2, points: [[0, 0], [5, 5]] } })).id;
  });
  await resent;
  await waitFor(() => states.length > 0);
  expect(states.map((state) => state.drawings.map((d) => d.id).sort())).toEqual([[before.id, added].sort()]);
  playerSocket.disconnect();
});

it('makes an erase sent during a resize wait for it', async () => {
  const drawing = await draw([[100, 100], [200, 200]]);
  const playerSocket = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const mine = await prisma.mapDrawing.create({ data: { mapId, authorId: playerId, kind: 'line', color: '#1a1a1a', width: 2, points: [[0, 0], [5, 5]] } });
  const sent: { resized?: Promise<request.Response>; erased?: Promise<unknown> } = {};
  // Held here, the map's lock queues the resize, then the erase behind it.
  await withMapsLocked([mapId], async () => {
    sent.resized = resize({ width: 20 }).then((res) => res);
    while (writersWaitingFor(mapId) < 1) await sleep(10);
    sent.erased = playerSocket.timeout(10000).emitWithAck('drawing:remove', { mapId, drawingId: mine.id });
    while (writersWaitingFor(mapId) < 2) await sleep(10);
  });
  expect((await sent.resized)?.status).toBe(200);
  expect(await sent.erased).toEqual({ ok: true });
  expect(await prisma.mapDrawing.findUnique({ where: { id: mine.id } })).toBeNull();
  expect((await stored(drawing.id)).points).toEqual([[200, 100], [400, 200]]);
  playerSocket.disconnect();
});

it('resizes a map holding all the drawing its markup layer can, inside the transaction\'s time', async () => {
  const perDrawing = DRAWING_LIMITS.maxPoints;
  // Both shares at their budget of points: the most the layer holds.
  const count = (DRAWING_LIMITS.markupShares.DM.points + DRAWING_LIMITS.markupShares.PLAYERS.points) / perDrawing;
  const points = Array.from({ length: perDrawing }, (_, i) => [i % 500, Math.floor(i / 500)]);
  await prisma.mapDrawing.createMany({
    data: Array.from({ length: count }, () => ({ mapId, authorId: dmId, kind: 'pen', color: '#1a1a1a', width: 2, points })),
  });
  const started = Date.now();
  expect((await resize({ width: 20, height: 30 })).status).toBe(200);
  const took = Date.now() - started;
  const sample = await prisma.mapDrawing.findFirstOrThrow({ where: { mapId } });
  expect((sample.points as number[][])[perDrawing - 1]).toEqual([998, 9]);
  // Prisma's interactive transaction gives up after 5 seconds.
  expect(took).toBeLessThan(4000);
});
