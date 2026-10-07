/**
 * A map holds at most 1,000 tokens, and a token's stat block at most 64 KB.
 *
 * Neither was bounded. A map's tokens are one JSON column, read whole by
 * every token write, every drag and every map fetch, so anyone who could
 * create a campaign could grow one map's row to hundreds of megabytes and
 * stall the server for every table. The count is checked under the map's
 * lock, so two adds at once cannot both slip past it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { readTokens, toJson } from '../../utils/prisma-json';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const token = (i: number) => ({
  id: randomUUID(), name: `Goblin ${i}`, imageUrl: '', position: { x: i % 20, y: Math.floor(i / 20) % 20 },
  size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
});
const statBlock = { ac: 12, speed: '30 ft.', abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 14, cha: 10 } };

async function newMap(count: number): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: `Holds ${count}`, imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: toJson(Array.from({ length: count }, (_, i) => token(i))), annotations: [],
    },
  });
  return map.id;
}
const count = async (mapId: string) =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens).length;
const add = (mapId: string, body: Record<string, unknown> = {}) =>
  dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Goblin', position: { x: 1, y: 1 }, ...body });

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `tokenlimits-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Token limits ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('tokens per map', () => {
  it('adds the thousandth token', async () => {
    const mapId = await newMap(999);

    expect((await add(mapId)).status).toBe(201);
    expect(await count(mapId)).toBe(1000);
  });

  it('refuses a token past the thousandth, saying why', async () => {
    const mapId = await newMap(1000);

    const res = await add(mapId);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1,000 tokens/);
    expect(await count(mapId)).toBe(1000);
  });

  it('lets only one of two adds at once take the last place', async () => {
    const mapId = await newMap(999);

    const [a, b] = await Promise.all([add(mapId), add(mapId)]);

    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(await count(mapId)).toBe(1000);
  });

  it('refuses moving tokens onto a map they would take past 1,000', async () => {
    const source = await newMap(5);
    const target = await newMap(998);
    const sourceTokens = readTokens((await prisma.map.findUniqueOrThrow({ where: { id: source } })).tokens);

    const res = await dm
      .post(`/api/campaigns/${campaignId}/maps/${source}/tokens/move`)
      .send({ tokenIds: sourceTokens.slice(0, 3).map((t) => t.id), targetMapId: target });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1,000 tokens/);
    expect(await count(source)).toBe(5);
    expect(await count(target)).toBe(998);
  });

  it('still moves, edits and removes tokens on a map stored with more', async () => {
    const mapId = await newMap(1001);
    const [first] = readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId } })).tokens);

    expect((await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${first.id}`).send({ name: 'Renamed' })).status).toBe(200);
    expect((await dm.delete(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/${first.id}`)).status).toBe(200);
  });
});

describe('a token\'s stat block', () => {
  it('refuses a megabyte hidden under a key the schema does not name', async () => {
    const mapId = await newMap(0);

    const res = await add(mapId, { statBlock: { ...statBlock, junk: 'x'.repeat(900000) } });

    expect(res.status).toBe(400);
    expect(await count(mapId)).toBe(0);
  });

  it('takes an ordinary one', async () => {
    const mapId = await newMap(0);

    expect((await add(mapId, { statBlock })).status).toBe(201);
  });
});
