/**
 * A drag's pick-up and drop name their token and its map by their ids, both
 * strings. One that is anything else is refused as a missing id is, before
 * anything is read.
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
let gmId: string;
let campaignId: string;
let gmCookie: string;
let mapId: string;
let tokenId: string;

beforeAll(async () => {
  const gm = await prisma.user.create({ data: { email: `move-id-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Move Id GM' } });
  gmId = gm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Move Id ${runId}`, ownerId: gmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
  tokenId = randomUUID();
  const token = {
    id: tokenId, name: 'Bramble Hound', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 },
    layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  };
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Kennels', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, tokens: toJson([token]), annotations: [],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  gmCookie = await server.loginAs(gmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: gmId } });
  await prisma.$disconnect();
});

const notStrings: Array<[string, unknown]> = [['a number', 42], ['an object', { id: 'x' }], ['a list', ['x']]];

describe('token.move.start', () => {
  it.each(notStrings)('refuses a tokenId that is %s', async (_label, badId) => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(gm, 'error');

    gm.emit('token.move.start', { tokenId: badId, mapId });

    expect((await error).message).toBe('tokenId and mapId required');
    gm.disconnect();
  });

  it.each(notStrings)('refuses a mapId that is %s', async (_label, badId) => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(gm, 'error');

    gm.emit('token.move.start', { tokenId, mapId: badId });

    expect((await error).message).toBe('tokenId and mapId required');
    gm.disconnect();
  });
});

const storedPosition = async () =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens)[0].position;

describe('token.move.end', () => {
  it.each(notStrings)('refuses a tokenId that is %s, and no token moves', async (_label, badId) => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(gm, 'error');

    gm.emit('token.move.end', { tokenId: badId, mapId, x: 3, y: 3 });

    expect((await error).message).toBe('Invalid token move data');
    expect(await storedPosition()).toEqual({ x: 1, y: 1 });
    gm.disconnect();
  });

  it.each(notStrings)('refuses a mapId that is %s, and no token moves', async (_label, badId) => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(gm, 'error');

    gm.emit('token.move.end', { tokenId, mapId: badId, x: 3, y: 3 });

    expect((await error).message).toBe('Invalid token move data');
    expect(await storedPosition()).toEqual({ x: 1, y: 1 });
    gm.disconnect();
  });
});
