/**
 * GET /api/campaigns/:campaignId/maps/:id/drawings, the drawings on a map
 * as the caller may be sent them.
 *
 * The DM is given every drawing; a player or a spectator those for
 * everyone, never one for the DM alone. A map the caller may not read, a
 * prepared one for a player or another campaign's, is answered as one that
 * is not there. Every caller gets the drawings in the same order, the one
 * the layers draw them in.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const users: string[] = [];
let mine: string;
let theirs: string;
let shownMap: string;
let preparedMap: string;
let theirMap: string;
let dmId: string;
let playerId: string;
const agents = {} as Record<'dm' | 'player' | 'spectator' | 'stranger', ReturnType<typeof request.agent>>;
const order: string[] = [];
let secretId: string;

const newMap = async (campaignId: string, name: string) => (await prisma.map.create({
  data: { campaignId, name, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
})).id;

const drawing = (mapId: string, authorId: string | null, extra: Record<string, unknown> = {}) =>
  prisma.mapDrawing.create({ data: { mapId, authorId, kind: 'line', color: '#3d8bd9', width: 3, points: [[0, 0], [10, 10]], ...extra } });

beforeAll(async () => {
  const [d, p, s, stranger, other] = await Promise.all(
    ['Drawings DM', 'Drawings Player', 'Drawings Spectator', 'Stranger', 'Other DM'].map((displayName) => createTestUser({ displayName }))
  );
  users.push(d.id, p.id, s.id, stranger.id, other.id);
  dmId = d.id;
  playerId = p.id;
  mine = (await createTestCampaign(d.id, { name: 'Mine' })).id;
  theirs = (await createTestCampaign(other.id, { name: 'Theirs' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: d.id, campaignId: mine, role: 'DM', characterIds: [] },
      { userId: p.id, campaignId: mine, role: 'PLAYER', characterIds: [] },
      { userId: s.id, campaignId: mine, role: 'SPECTATOR', characterIds: [] },
      { userId: other.id, campaignId: theirs, role: 'DM', characterIds: [] },
    ],
  });
  shownMap = await newMap(mine, 'Shown');
  preparedMap = await newMap(mine, 'Prepared');
  theirMap = await newMap(theirs, 'Theirs');
  await prisma.campaign.update({ where: { id: mine }, data: { currentMapId: shownMap } });
  for (const [who, user] of [['dm', d], ['player', p], ['spectator', s], ['stranger', stranger]] as const) {
    agents[who] = request.agent(app);
    await agents[who].post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  }

  // Drawn out of order: the answer sorts by sortKey, then time, then id.
  const last = await drawing(shownMap, playerId, { sortKey: 10 });
  const first = await drawing(shownMap, dmId, { sortKey: -1 });
  const secret = await drawing(shownMap, dmId, { audience: 'DM', kind: 'text', points: [[5, 5]], text: 'The vault' });
  const middle = await drawing(shownMap, null);
  order.push(first.id, secret.id, middle.id, last.id);
  secretId = secret.id;
  await drawing(preparedMap, dmId);
  await drawing(theirMap, other.id);
});

afterAll(async () => {
  await prisma.campaign.update({ where: { id: mine }, data: { currentMapId: null } });
  await cleanupCampaigns([mine, theirs]);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

const read = (who: keyof typeof agents, campaignId: string, mapId: string) =>
  agents[who].get(`/api/campaigns/${campaignId}/maps/${mapId}/drawings`);

it('gives the DM every drawing on the map, in drawing order, as the socket sends them', async () => {
  const res = await read('dm', mine, shownMap);
  expect(res.status).toBe(200);
  expect(res.body.drawings.map((d: { id: string }) => d.id)).toEqual(order);
  expect(res.body.drawings[1]).toEqual({
    id: secretId, authorId: dmId, audience: 'DM', layer: 'MARKUP', kind: 'text', color: '#3d8bd9', fillColor: null,
    width: 3, rotation: 0, sortKey: 0, points: [[5, 5]], text: 'The vault', createdAt: expect.any(String),
  });
});

it.each(['player', 'spectator'] as const)('gives a %s the drawings for everyone and none for the DM alone', async (who) => {
  const res = await read(who, mine, shownMap);
  expect(res.status).toBe(200);
  expect(res.body.drawings.map((d: { id: string }) => d.id)).toEqual(order.filter((id) => id !== secretId));
});

it('answers a player about a prepared map as about a map that is not there', async () => {
  const prepared = await read('player', mine, preparedMap);
  const missing = await read('player', mine, randomUUID());
  expect(prepared.status).toBe(404);
  expect(prepared.body).toEqual(missing.body);
  expect((await read('dm', mine, preparedMap)).body.drawings).toHaveLength(1);
});

it('answers about another campaign\'s map as about a map that is not there', async () => {
  const res = await read('dm', mine, theirMap);
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Not Found', message: 'Map not found' });
});

it('refuses someone who is not in the campaign', async () => {
  expect((await read('stranger', mine, shownMap)).status).toBe(403);
});
