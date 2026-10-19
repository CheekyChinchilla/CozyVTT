/**
 * A map the caller may not read is answered as one that is not there.
 *
 * The map routes answered "Map not found" for an id that names nothing, and
 * "Map not found in this campaign" for another campaign's map, or for a map a
 * player may not see yet (one the DM is preparing), so a member could tell
 * that such a map exists. Both now get the same 404 and message.
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
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;

const newMap = async (campaignId: string, name: string) => (await prisma.map.create({
  data: {
    campaignId, name, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [],
    tokens: [{ id: 'tok', name: 'Rat', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 } }],
  },
})).id;

beforeAll(async () => {
  const [d, p, other] = await Promise.all(['Maps DM', 'Maps Player', 'Other DM'].map((displayName) => createTestUser({ displayName })));
  users.push(d.id, p.id, other.id);
  mine = (await createTestCampaign(d.id, { name: 'Mine' })).id;
  theirs = (await createTestCampaign(other.id, { name: 'Theirs' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: d.id, campaignId: mine, role: 'DM', characterIds: [] },
      { userId: p.id, campaignId: mine, role: 'PLAYER', characterIds: [] },
      { userId: other.id, campaignId: theirs, role: 'DM', characterIds: [] },
    ],
  });
  shownMap = await newMap(mine, 'Shown');
  preparedMap = await newMap(mine, 'Prepared');
  theirMap = await newMap(theirs, 'Theirs');
  await prisma.campaign.update({ where: { id: mine }, data: { currentMapId: shownMap } });
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: d.email, password: TEST_PASSWORD }).expect(200);
  player = request.agent(app);
  await player.post('/api/auth/login').send({ email: p.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.campaign.update({ where: { id: mine }, data: { currentMapId: null } });
  await cleanupCampaigns([mine, theirs]);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

const base = () => `/api/campaigns/${mine}/maps`;
type Call = (agent: ReturnType<typeof request.agent>, id: string) => request.Test;

const dmRoutes: Array<[string, Call]> = [
  ['GET a map', (a, id) => a.get(`${base()}/${id}`)],
  ['PUT a map', (a, id) => a.put(`${base()}/${id}`).send({ name: 'Renamed' })],
  ['DELETE a map', (a, id) => a.delete(`${base()}/${id}`)],
  ['make a map current', (a, id) => a.put(`${base()}/${id}/set-current`)],
  ['place a token', (a, id) => a.post(`${base()}/${id}/tokens`).send({ name: 'Goblin', position: { x: 1, y: 1 } })],
  ['change a token', (a, id) => a.put(`${base()}/${id}/tokens/tok`).send({ name: 'Renamed' })],
  ['remove a token', (a, id) => a.delete(`${base()}/${id}/tokens/tok`)],
  ['GET walls', (a, id) => a.get(`${base()}/${id}/walls`)],
  ['GET lights', (a, id) => a.get(`${base()}/${id}/lights`)],
];

it.each(dmRoutes)('%s of another campaign answers as an unknown id', async (_label, call) => {
  const missing = await call(dm, randomUUID());
  const elsewhere = await call(dm, theirMap);
  expect(missing.status).toBe(404);
  expect({ status: elsewhere.status, body: elsewhere.body }).toEqual({ status: missing.status, body: missing.body });
});

const playerRoutes: Array<[string, Call]> = [
  ['GET a map', (a, id) => a.get(`${base()}/${id}`)],
  ['move a token', (a, id) => a.put(`${base()}/${id}/tokens/tok`).send({ position: { x: 2, y: 2 } })],
  ['GET walls', (a, id) => a.get(`${base()}/${id}/walls`)],
  ['GET lights', (a, id) => a.get(`${base()}/${id}/lights`)],
];

it.each(playerRoutes)('%s the DM is preparing answers a player as an unknown id', async (_label, call) => {
  const missing = await call(player, randomUUID());
  const prepared = await call(player, preparedMap);
  expect(missing.status).toBe(404);
  expect({ status: prepared.status, body: prepared.body }).toEqual({ status: missing.status, body: missing.body });
});
