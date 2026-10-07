/**
 * A dropped token stands on whole squares with its footprint on the map,
 * as over REST (tokenFootprint.e2e.test.ts). The client always floors and
 * clamps a drop; this is what a scripted one gets.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { readTokens, toJson } from '../../utils/prisma-json';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let campaignId: string;
let dmCookie: string;

const ogre = () => ({
  id: randomUUID(), name: 'Ogre', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 2, height: 2 },
  layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
});

async function newMap(tokens: unknown[]): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Drop', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, tokens: toJson(tokens), annotations: [],
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}
const storedPosition = async (mapId: string) =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens)[0].position;

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `drop-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Drop DM' } });
  dmId = dm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Drop ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: dmId } });
  await prisma.$disconnect();
});

it('refuses a drop between squares, and the token stays where it was', async () => {
  const token = ogre();
  const mapId = await newMap([token]);
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const error = waitForEvent<{ message: string }>(dm, 'error');

  dm.emit('token.move.end', { tokenId: token.id, mapId, x: 3.5, y: 2 });

  expect((await error).message).toMatch(/Invalid token move data/);
  expect(await storedPosition(mapId)).toEqual({ x: 1, y: 1 });
  dm.disconnect();
});

it('pulls a drop that would hang off the edge back onto the map, and says where it went', async () => {
  const token = ogre();
  const mapId = await newMap([token]);
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const moved = waitForEvent<{ x: number; y: number }>(dm, 'token.moved');

  dm.emit('token.move.end', { tokenId: token.id, mapId, x: 9, y: 9 });

  expect(await moved).toMatchObject({ x: 8, y: 8 });
  expect(await storedPosition(mapId)).toEqual({ x: 8, y: 8 });
  dm.disconnect();
});
