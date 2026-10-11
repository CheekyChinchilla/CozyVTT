/**
 * What a player is sent of a map's walls and lights.
 *
 * Players' browsers need the walls to work out their own sight, so every
 * wall is sent. But a door's lock is the DM's to reveal, and a light the DM
 * has turned off lights nothing a player could see: every member was sent
 * each door's real state, locked included, and every light, off ones
 * included. A player (or spectator) is now sent a locked door as a closed
 * one and no light that is off, on every path: the map itself, the replies to
 * walls:request and lights:request, the REST reads, and each live edit. A
 * light turned on or off reaches them as appearing or going.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createTestUser, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(20000);

const app = createTestApp();
const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dmCookie: string;
let playerCookie: string;
let playerAgent: ReturnType<typeof request.agent>;

type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; type: string };
type Light = { id: string; x: number; y: number; brightRadius: number; dimRadius: number; color: string; enabled: boolean };

const LOCKED: Wall = { id: randomUUID(), x1: 100, y1: 100, x2: 150, y2: 100, type: 'door-locked' };
const PLAIN: Wall = { id: randomUUID(), x1: 200, y1: 100, x2: 300, y2: 100, type: 'wall' };
const LIT: Light = { id: randomUUID(), x: 300, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true };
const OUT: Light = { id: randomUUID(), x: 600, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: false };

async function newMap(): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Secrets', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson([LOCKED, PLAIN]), lights: toJson([LIT, OUT]),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

const asClosed = { ...LOCKED, type: 'door-closed' };

beforeAll(async () => {
  const dm = await createTestUser({ displayName: 'Secrets DM' });
  const player = await createTestUser({ displayName: 'Secrets Player' });
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Secrets ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
  playerCookie = await server.loginAs(playerId);
  playerAgent = request.agent(app);
  expect((await playerAgent.post('/api/auth/login').send({ email: player.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('opening a map', () => {
  it('answers walls:request and lights:request with locked doors closed and no light that is off', async () => {
    const mapId = await newMap();
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const walls = waitForEvent<{ segments: Wall[] }>(player, 'walls:replaced');
    player.emit('walls:request', { mapId });
    expect((await walls).segments).toEqual([asClosed, PLAIN]);

    const lights = waitForEvent<{ lights: Light[] }>(player, 'lights:replaced');
    player.emit('lights:request', { mapId });
    expect((await lights).lights).toEqual([LIT]);

    // The DM is sent the map as it is.
    const dmWalls = waitForEvent<{ segments: Wall[] }>(dm, 'walls:replaced');
    dm.emit('walls:request', { mapId });
    expect((await dmWalls).segments).toEqual([LOCKED, PLAIN]);

    player.disconnect();
    dm.disconnect();
  });

  it('sends the map, and the REST reads, the same way', async () => {
    const mapId = await newMap();
    const map = await playerAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}`);
    expect(map.status).toBe(200);
    expect(map.body.map.wallSegments).toEqual([asClosed, PLAIN]);
    expect(map.body.map.lights).toEqual([LIT]);

    expect((await playerAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}/walls`)).body.segments).toEqual([asClosed, PLAIN]);
    expect((await playerAgent.get(`/api/campaigns/${campaignId}/maps/${mapId}/lights`)).body.lights).toEqual([LIT]);
  });
});

describe('a live edit', () => {
  it('tells a player of a door the DM locks as a closed door', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const door = { ...PLAIN, id: randomUUID(), type: 'door-closed' };
    const added = waitForEvent<{ segment: Wall }>(player, 'wall:added');
    dm.emit('wall:add', { mapId, segment: { ...door, type: 'door-locked' } });
    expect((await added).segment).toEqual(door);

    const updated = waitForEvent<{ segment: Wall }>(player, 'wall:updated');
    dm.emit('wall:update', { mapId, segment: { ...door, type: 'door-locked', x2: 280 } });
    expect((await updated).segment).toEqual({ ...door, x2: 280 });

    const replaced = waitForEvent<{ segments: Wall[] }>(player, 'walls:replaced');
    dm.emit('walls:replace', { mapId, segments: [LOCKED] });
    expect((await replaced).segments).toEqual([asClosed]);

    dm.disconnect();
    player.disconnect();
  });

  // The player's page has the door as closed, so it offers to open it, and
  // draws it open at once. The refusal puts it back.
  it('answers a player who tries a locked door with the door as they may see it, closed', async () => {
    const mapId = await newMap();
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const refused = waitForEvent<{ message: string }>(player, 'error');
    const back = waitForEvent<{ segment: Wall; opId?: string }>(player, 'wall:updated');
    player.emit('wall:update', { mapId, segment: { ...asClosed, type: 'door-open' }, opId: 'try-the-door' });
    expect((await refused).message).toBe('That door is locked');
    const corrected = await back;
    expect(corrected.segment).toEqual(asClosed);
    expect(corrected.opId).toBeUndefined();

    player.disconnect();
  });

  it('sends a player no light that is off, and a light turned on or off as appearing or going', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const dark = { ...LIT, id: randomUUID(), enabled: false };
    const quiet = expectNoEvent(player, 'light:added', 500);
    const dmAdded = waitForEvent(dm, 'light:added');
    dm.emit('light:add', { mapId, light: dark });
    await dmAdded;
    await quiet;

    const appeared = waitForEvent<{ light: Light }>(player, 'light:added');
    dm.emit('light:update', { mapId, light: { ...dark, enabled: true } });
    expect((await appeared).light).toEqual({ ...dark, enabled: true });

    const gone = waitForEvent<{ lightId: string }>(player, 'light:removed');
    dm.emit('light:update', { mapId, light: { ...dark, enabled: false } });
    expect((await gone).lightId).toBe(dark.id);

    const replaced = waitForEvent<{ lights: Light[] }>(player, 'lights:replaced');
    dm.emit('lights:replace', { mapId, lights: [LIT, OUT] });
    expect((await replaced).lights).toEqual([LIT]);

    dm.disconnect();
    player.disconnect();
  });
});
