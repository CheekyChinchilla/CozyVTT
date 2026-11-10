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
let dmId: string;
let campaignId: string;
let dmCookie: string;
let mapId: string;
let tokenId: string;

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `move-id-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Move Id DM' } });
  dmId = dm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Move Id ${runId}`, ownerId: dmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
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

const notStrings: Array<[string, unknown]> = [['a number', 42], ['an object', { id: 'x' }], ['a list', ['x']]];

describe('token.move.start', () => {
  it.each(notStrings)('refuses a tokenId that is %s', async (_label, badId) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(dm, 'error');

    dm.emit('token.move.start', { tokenId: badId, mapId });

    expect((await error).message).toBe('tokenId and mapId required');
    dm.disconnect();
  });

  it.each(notStrings)('refuses a mapId that is %s', async (_label, badId) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(dm, 'error');

    dm.emit('token.move.start', { tokenId, mapId: badId });

    expect((await error).message).toBe('tokenId and mapId required');
    dm.disconnect();
  });
});

const storedPosition = async () =>
  readTokens((await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } })).tokens)[0].position;

describe('token.move.end', () => {
  it.each(notStrings)('refuses a tokenId that is %s, and no token moves', async (_label, badId) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(dm, 'error');

    dm.emit('token.move.end', { tokenId: badId, mapId, x: 3, y: 3 });

    expect((await error).message).toBe('Invalid token move data');
    expect(await storedPosition()).toEqual({ x: 1, y: 1 });
    dm.disconnect();
  });

  it.each(notStrings)('refuses a mapId that is %s, and no token moves', async (_label, badId) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const error = waitForEvent<{ message: string }>(dm, 'error');

    dm.emit('token.move.end', { tokenId, mapId: badId, x: 3, y: 3 });

    expect((await error).message).toBe('Invalid token move data');
    expect(await storedPosition()).toEqual({ x: 1, y: 1 });
    dm.disconnect();
  });
});
