/**
 * A token stands on whole squares, with its whole footprint on the map.
 *
 * The routes checked only that a token's corner square was on the map, and
 * took a fractional square, so a script could store positions the client
 * never produces: a token mostly off the map, or half a square from where
 * other clients draw it. A fraction is now refused, and a footprint that
 * would hang off the far edge is pulled back onto the map, the rule the
 * client applies when it offers a move (clampTokenPosition). Placing a large
 * creature at the centre of a small map lands it on the map.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { readTokens, toJson } from '../../utils/prisma-json';

const app = createTestApp();
let dmId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

const token = (over: Record<string, unknown>) => ({
  id: randomUUID(), name: 'Ogre', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 2, height: 2 },
  layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {}, ...over,
});

async function newMap(tokens: unknown[] = []): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Footprint', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, tokens: toJson(tokens), annotations: [],
    },
  });
  return map.id;
}
const storedTokens = async (mapId: string) =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens);
const tokens = (mapId: string) => `/api/campaigns/${campaignId}/maps/${mapId}/tokens`;

beforeAll(async () => {
  const stamp = Date.now();
  const user = await createTestUser({ email: `footprint-${stamp}@test.cozyvtt.local` });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: `Footprint ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

describe('POST /tokens', () => {
  it('refuses a position between squares', async () => {
    const mapId = await newMap();

    const res = await dm.post(tokens(mapId)).send({ name: 'Ogre', position: { x: 5.5, y: 3 } });

    expect(res.status).toBe(400);
    expect(await storedTokens(mapId)).toEqual([]);
  });

  it('pulls a footprint that would hang off the far edge back onto the map', async () => {
    const mapId = await newMap();

    const res = await dm.post(tokens(mapId)).send({ name: 'Giant', position: { x: 8, y: 9 }, size: { width: 4, height: 4 } });

    expect(res.status).toBe(201);
    expect(res.body.token.position).toEqual({ x: 6, y: 6 });
    expect((await storedTokens(mapId))[0].position).toEqual({ x: 6, y: 6 });
  });

  it('puts a token larger than the map at its corner', async () => {
    const mapId = await newMap();

    const res = await dm.post(tokens(mapId)).send({ name: 'Colossus', position: { x: 5, y: 5 }, size: { width: 10, height: 10 } });

    expect(res.body.token.position).toEqual({ x: 0, y: 0 });
  });

  it('still refuses a corner off the map', async () => {
    const mapId = await newMap();

    expect((await dm.post(tokens(mapId)).send({ name: 'Ogre', position: { x: 10, y: 0 } })).status).toBe(400);
  });
});

describe('PUT /tokens/:tokenId', () => {
  it('refuses a position between squares, and leaves the token where it was', async () => {
    const ogre = token({});
    const mapId = await newMap([ogre]);

    const res = await dm.put(`${tokens(mapId)}/${ogre.id}`).send({ position: { x: 2.5, y: 1 } });

    expect(res.status).toBe(400);
    expect((await storedTokens(mapId))[0].position).toEqual({ x: 1, y: 1 });
  });

  it('pulls a move that would hang off the edge back onto the map, by the token\'s size', async () => {
    const ogre = token({});
    const mapId = await newMap([ogre]);

    const res = await dm.put(`${tokens(mapId)}/${ogre.id}`).send({ position: { x: 9, y: 0 } });

    expect(res.status).toBe(200);
    expect((await storedTokens(mapId))[0].position).toEqual({ x: 8, y: 0 });
  });

  it('uses the new size when the same request changes it', async () => {
    const ogre = token({});
    const mapId = await newMap([ogre]);

    await dm.put(`${tokens(mapId)}/${ogre.id}`).send({ position: { x: 8, y: 8 }, size: { width: 3, height: 3 } });

    expect((await storedTokens(mapId))[0].position).toEqual({ x: 7, y: 7 });
  });
});
