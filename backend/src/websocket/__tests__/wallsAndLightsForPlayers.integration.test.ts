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
import type { Socket } from 'socket.io-client';
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
let dmAgent: ReturnType<typeof request.agent>;

type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; type: string };
type Light = { id: string; x: number; y: number; brightRadius: number; dimRadius: number; color: string; enabled: boolean };

const LOCKED: Wall = { id: randomUUID(), x1: 100, y1: 100, x2: 150, y2: 100, type: 'door-locked' };
const PLAIN: Wall = { id: randomUUID(), x1: 200, y1: 100, x2: 300, y2: 100, type: 'wall' };
const LIT: Light = { id: randomUUID(), x: 300, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true };
const OUT: Light = { id: randomUUID(), x: 600, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: false };

/** A map on screen holding LOCKED, PLAIN, LIT and OUT; `lit` turns dynamic lighting on. */
async function newMap(lit = false): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Secrets', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [], lightingEnabled: lit,
      wallSegments: toJson([LOCKED, PLAIN]), lights: toJson([LIT, OUT]),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

const asClosed = { ...LOCKED, type: 'door-closed' };

/** What a page is told of a map's walls and lights, and the map sent again. */
const MAP_EVENTS = [
  'map.changed', 'wall:added', 'wall:updated', 'wall:removed', 'walls:replaced',
  'light:added', 'light:updated', 'light:removed', 'lights:replaced',
];

/**
 * The map, wall and light events `client` receives from now on, in order.
 * Read it after `settled()`, which outlasts the re-send of the map that
 * follows a change by 150 ms.
 */
function heard(client: Socket): string[] {
  const events: string[] = [];
  client.onAny((event: string) => { if (MAP_EVENTS.includes(event)) events.push(event); });
  return events;
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 700));

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
  dmAgent = request.agent(app);
  expect((await dmAgent.post('/api/auth/login').send({ email: dm.email, password: TEST_PASSWORD })).status).toBe(200);
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

    const moved = { ...LIT, x: 350 };
    const replaced = waitForEvent<{ lights: Light[] }>(player, 'lights:replaced');
    dm.emit('lights:replace', { mapId, lights: [moved, OUT] });
    expect((await replaced).lights).toEqual([moved]);

    dm.disconnect();
    player.disconnect();
  });
});

/**
 * Nothing at all, when nothing a player has changes. A player has a locked
 * door as a closed one, and no light that is off, so a closed door locked or
 * unlocked, or a light that is off deleted, leaves their copy as it was. An
 * event for it told them something had just happened to that door, or that
 * a light they never had was there.
 */
describe('a change a player cannot see', () => {
  it('sends a player nothing when the DM locks or unlocks a closed door', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const door = { ...PLAIN, id: randomUUID(), type: 'door-closed' };
    const added = waitForEvent(player, 'wall:added');
    dm.emit('wall:add', { mapId, segment: door });
    await added;

    const quiet = expectNoEvent(player, 'wall:updated', 800);
    const locked = waitForEvent<{ segment: Wall }>(dm, 'wall:updated');
    dm.emit('wall:update', { mapId, segment: { ...door, type: 'door-locked' } });
    expect((await locked).segment.type).toBe('door-locked');
    const unlocked = waitForEvent<{ segment: Wall }>(dm, 'wall:updated');
    dm.emit('wall:update', { mapId, segment: door });
    expect((await unlocked).segment.type).toBe('door-closed');
    await quiet;

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player nothing when the DM deletes a light that is off, and the light going when it is on', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const quiet = expectNoEvent(player, 'light:removed', 500);
    const dmGone = waitForEvent<{ lightId: string }>(dm, 'light:removed');
    dm.emit('light:remove', { mapId, lightId: OUT.id });
    expect((await dmGone).lightId).toBe(OUT.id);
    await quiet;

    const gone = waitForEvent<{ lightId: string }>(player, 'light:removed');
    dm.emit('light:remove', { mapId, lightId: LIT.id });
    expect((await gone).lightId).toBe(LIT.id);

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player nothing for the same changes made through the REST routes', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const base = `/api/campaigns/${campaignId}/maps/${mapId}`;

    const quietWall = expectNoEvent(player, 'wall:updated', 800);
    const quietLight = expectNoEvent(player, 'light:removed', 800);
    const dmWall = waitForEvent<{ segment: Wall }>(dm, 'wall:updated');
    expect((await dmAgent.patch(`${base}/walls/${LOCKED.id}`).send({ type: 'door-closed' })).status).toBe(200);
    expect((await dmWall).segment).toEqual(asClosed);
    const dmLight = waitForEvent<{ lightId: string }>(dm, 'light:removed');
    expect((await dmAgent.delete(`${base}/lights/${OUT.id}`)).status).toBe(200);
    expect((await dmLight).lightId).toBe(OUT.id);
    await Promise.all([quietWall, quietLight]);

    const gone = waitForEvent<{ lightId: string }>(player, 'light:removed');
    expect((await dmAgent.delete(`${base}/lights/${LIT.id}`)).status).toBe(200);
    expect((await gone).lightId).toBe(LIT.id);

    dm.disconnect();
    player.disconnect();
  });
});

/**
 * On a lit map, a wall or light change also sends every player the map again
 * (`map.changed`) a moment later, as they can now see it. A change they were
 * sent nothing for must not: the map arriving told them something had just
 * changed where they could not see.
 */
describe('a change a player cannot see, on a lit map', () => {
  it('sends a player no map when the DM unlocks or locks a closed door, and the map when the DM opens it', async () => {
    const mapId = await newMap(true);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const told = heard(player);
    const unlocked = waitForEvent<{ segment: Wall }>(dm, 'wall:updated');
    dm.emit('wall:update', { mapId, segment: asClosed });
    expect((await unlocked).segment).toEqual(asClosed);
    const locked = waitForEvent<{ segment: Wall }>(dm, 'wall:updated');
    dm.emit('wall:update', { mapId, segment: LOCKED });
    expect((await locked).segment).toEqual(LOCKED);
    await settled();
    expect(told).toEqual([]);

    const resent = waitForEvent(player, 'map.changed');
    dm.emit('wall:update', { mapId, segment: { ...LOCKED, type: 'door-open' } });
    await resent;

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player no map when the DM adds, changes or deletes a light that is off, and the map when one is on', async () => {
    const mapId = await newMap(true);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const dark = { ...OUT, id: randomUUID(), x: 700 };
    const told = heard(player);
    const added = waitForEvent(dm, 'light:added');
    dm.emit('light:add', { mapId, light: dark });
    await added;
    const moved = waitForEvent(dm, 'light:updated');
    dm.emit('light:update', { mapId, light: { ...OUT, x: 650 } });
    await moved;
    const removed = waitForEvent(dm, 'light:removed');
    dm.emit('light:remove', { mapId, lightId: dark.id });
    await removed;
    await settled();
    expect(told).toEqual([]);

    const resent = waitForEvent(player, 'map.changed');
    dm.emit('light:remove', { mapId, lightId: LIT.id });
    await resent;

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player no map for the same changes made through the REST routes', async () => {
    const mapId = await newMap(true);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const base = `/api/campaigns/${campaignId}/maps/${mapId}`;

    const told = heard(player);
    expect((await dmAgent.patch(`${base}/walls/${LOCKED.id}`).send({ type: 'door-closed' })).status).toBe(200);
    expect((await dmAgent.patch(`${base}/walls/${LOCKED.id}`).send({ type: 'door-locked' })).status).toBe(200);
    const dark = { ...OUT, id: randomUUID(), x: 700 };
    expect((await dmAgent.post(`${base}/lights`).send(dark)).status).toBe(201);
    expect((await dmAgent.patch(`${base}/lights/${OUT.id}`).send({ x: 650 })).status).toBe(200);
    expect((await dmAgent.delete(`${base}/lights/${dark.id}`)).status).toBe(200);
    await settled();
    expect(told).toEqual([]);

    const resent = waitForEvent(player, 'map.changed');
    expect((await dmAgent.patch(`${base}/lights/${OUT.id}`).send({ enabled: true })).status).toBe(200);
    await resent;

    player.disconnect();
  });
});

/**
 * The same for a whole list replaced at once, as the Walls panel's Change
 * type does to a selection (it offers Locked), and as Clear All in the
 * Lights panel does once only lights that are off are left. A player whose
 * list it leaves as it was is sent nothing, and on a lit map not the map
 * again either.
 */
describe.each([
  ['an unlit map', false],
  ['a lit map', true],
])('a whole list replaced on %s', (_label, lit) => {
  it('sends a player nothing when walls:replace leaves their walls as they were, and the walls when it does not', async () => {
    const mapId = await newMap(lit);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    // The locked door unlocked and locked again: a player has it closed throughout.
    const told = heard(player);
    const unlocked = waitForEvent<{ segments: Wall[] }>(dm, 'walls:replaced');
    dm.emit('walls:replace', { mapId, segments: [asClosed, PLAIN] });
    expect((await unlocked).segments).toEqual([asClosed, PLAIN]);
    const locked = waitForEvent<{ segments: Wall[] }>(dm, 'walls:replaced');
    dm.emit('walls:replace', { mapId, segments: [LOCKED, PLAIN] });
    expect((await locked).segments).toEqual([LOCKED, PLAIN]);
    await settled();
    expect(told).toEqual([]);

    const opened = { ...LOCKED, type: 'door-open' };
    const replaced = waitForEvent<{ segments: Wall[] }>(player, 'walls:replaced');
    const resent = lit ? waitForEvent(player, 'map.changed') : Promise.resolve();
    dm.emit('walls:replace', { mapId, segments: [opened, PLAIN] });
    expect((await replaced).segments).toEqual([opened, PLAIN]);
    await resent;

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player nothing when lights:replace leaves their lights as they were, Clear All on lights that are off included', async () => {
    const mapId = await newMap(lit);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    // The light that is off moved and another added: a player has only LIT throughout.
    const dark = { ...OUT, id: randomUUID(), x: 700 };
    const told = heard(player);
    const changed = waitForEvent(dm, 'lights:replaced');
    dm.emit('lights:replace', { mapId, lights: [LIT, { ...OUT, x: 650 }, dark] });
    await changed;
    await settled();
    expect(told).toEqual([]);

    // The last light that is on goes, which a player is sent; then Clear All.
    const lastOn = waitForEvent<{ lights: Light[] }>(player, 'lights:replaced');
    const resent = lit ? waitForEvent(player, 'map.changed') : Promise.resolve();
    dm.emit('lights:replace', { mapId, lights: [OUT, dark] });
    expect((await lastOn).lights).toEqual([]);
    await resent;
    await settled();
    const toldAfter = heard(player);
    const cleared = waitForEvent<{ lights: Light[] }>(dm, 'lights:replaced');
    dm.emit('lights:replace', { mapId, lights: [] });
    expect((await cleared).lights).toEqual([]);
    await settled();
    expect(toldAfter).toEqual([]);

    dm.disconnect();
    player.disconnect();
  });

  it('sends a player nothing for the same replaces made through the REST routes', async () => {
    const mapId = await newMap(lit);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const base = `/api/campaigns/${campaignId}/maps/${mapId}`;

    const told = heard(player);
    expect((await dmAgent.put(`${base}/walls`).send({ segments: [asClosed, PLAIN] })).status).toBe(200);
    expect((await dmAgent.put(`${base}/lights`).send({ lights: [LIT, { ...OUT, x: 650 }] })).status).toBe(200);
    await settled();
    expect(told).toEqual([]);

    const replaced = waitForEvent<{ lights: Light[] }>(player, 'lights:replaced');
    const resent = lit ? waitForEvent(player, 'map.changed') : Promise.resolve();
    expect((await dmAgent.put(`${base}/lights`).send({ lights: [] })).status).toBe(200);
    expect((await replaced).lights).toEqual([]);
    await resent;

    player.disconnect();
  });
});
