/**
 * Explored memory over the socket: what each player has seen of a map.
 *
 * Per user, per map, in the fog grid's shape. A reveal is stored, bounds
 * checked and echoed to that user; another player's memory is their own; the
 * DM can read a player's (for Player Preview) and can forget everyone's. The
 * server never consults this table when deciding which tokens to send, so a
 * forged reveal shows a player nothing they were not already given.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  expectNoEvent,
  waitForEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `explore-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let p1Id: string;
let p2Id: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let p1Cookie: string;
let p2Cookie: string;

type StateEvent = { mapId: string; cells: number[] };

beforeAll(async () => {
  const [dm, p1, p2] = await Promise.all(
    ['dm', 'p1', 'p2'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Explore ${name}` } })
    )
  );
  dmId = dm.id; p1Id = p1.id; p2Id = p2.id;
  const campaign = await prisma.campaign.create({ data: { name: `Explore ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Explore Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, tokens: [
        { id: 'mine', name: 'mine', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: p1Id, rotation: 0, conditions: [], metadata: {}, sightRadius: 0 },
        { id: 'npc', name: 'npc', imageUrl: '', position: { x: 8, y: 8 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {} },
      ], annotations: [], lightingEnabled: true, globalIllumination: false, explorationEnabled: true,
    },
  });
  mapId = map.id;
  server = await createWsTestServer();
  [dmCookie, p1Cookie, p2Cookie] = await Promise.all([server.loginAs(dmId), server.loginAs(p1Id), server.loginAs(p2Id)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, p1Id, p2Id] } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.mapExploration.deleteMany({ where: { mapId } });
  await prisma.map.update({ where: { id: mapId }, data: { explorationEnabled: true } });
});

describe('exploration:reveal', () => {
  it('stores the cells, unions later reveals, and echoes the user\'s whole memory', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);

    const first = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [0, 1, 2] });
    expect((await first).cells).toEqual([0, 1, 2]);

    const second = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [5] });
    expect((await second).cells).toEqual([0, 1, 2, 5]);

    const row = await prisma.mapExploration.findUniqueOrThrow({ where: { mapId_userId: { mapId, userId: p1Id } } });
    expect((row.explored as { revealed: boolean[] }).revealed[5]).toBe(true);
    p1.disconnect();
  });

  it('ignores cells outside the map', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const state = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [3, 999999] });
    expect((await state).cells).toEqual([3]);
    p1.disconnect();
  });

  it('is refused while explored memory is off for the map', async () => {
    await prisma.map.update({ where: { id: mapId }, data: { explorationEnabled: false } });
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(p1, 'error');
    p1.emit('exploration:reveal', { mapId, cells: [0] });
    expect((await denial).message).toMatch(/off/);
    expect(await prisma.mapExploration.count({ where: { mapId } })).toBe(0);
    p1.disconnect();
  });

  it('drops a flood silently', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const states: StateEvent[] = [];
    p1.on('exploration:state', (d: StateEvent) => states.push(d));
    for (let i = 0; i < 15; i++) p1.emit('exploration:reveal', { mapId, cells: [i] });
    await new Promise((r) => setTimeout(r, 700));
    expect(states.length).toBeGreaterThan(0);
    expect(states.length).toBeLessThanOrEqual(10);
    p1.disconnect();
  });

  it('never makes the server send a token: exploring the cell an unseen token stands on shows nothing', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    // The npc at (8,8) is dark to p1 (no light, no darkvision). Its fog cell:
    // top-origin row (10 - 1 - 8) = 1, col 8 → index 1 * 10 + 8 = 18.
    const nothing = expectNoEvent(p1, 'token:appeared', 500);
    const state = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [18] });
    expect((await state).cells).toEqual([18]);
    await nothing;
    p1.disconnect();
  });
});

describe('exploration:request', () => {
  it('gives each player their own memory, and nothing of another\'s', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const p2 = await server.connectAndAuth(p2Cookie, campaignId);
    const stored = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [7] });
    await stored;

    const own = waitForEvent<StateEvent>(p2, 'exploration:state');
    p2.emit('exploration:request', { mapId, userId: p1Id }); // naming another user is ignored for a player
    expect((await own).cells).toEqual([]);
    p1.disconnect();
    p2.disconnect();
  });

  it('lets the DM read a named player\'s memory', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const stored = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [7, 8] });
    await stored;

    const theirs = waitForEvent<StateEvent & { userId: string }>(dm, 'exploration:state');
    dm.emit('exploration:request', { mapId, userId: p1Id });
    const got = await theirs;
    expect(got.userId).toBe(p1Id);
    expect(got.cells).toEqual([7, 8]);
    p1.disconnect();
    dm.disconnect();
  });

  it('answers nothing while explored memory is off', async () => {
    await prisma.map.update({ where: { id: mapId }, data: { explorationEnabled: false } });
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const nothing = expectNoEvent(p1, 'exploration:state', 400);
    p1.emit('exploration:request', { mapId });
    await nothing;
    p1.disconnect();
  });
});

describe('exploration:reset', () => {
  it('lets the DM forget every player\'s memory, and tells the room', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const stored = waitForEvent<StateEvent>(p1, 'exploration:state');
    p1.emit('exploration:reveal', { mapId, cells: [1] });
    await stored;

    const cleared = waitForEvent<StateEvent>(p1, 'exploration:state');
    dm.emit('exploration:reset', { mapId });
    expect((await cleared).cells).toEqual([]);
    expect(await prisma.mapExploration.count({ where: { mapId } })).toBe(0);
    p1.disconnect();
    dm.disconnect();
  });

  it('refuses a player', async () => {
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const denial = waitForEvent<{ message: string }>(p1, 'error');
    p1.emit('exploration:reset', { mapId });
    expect((await denial).message).toMatch(/DM/);
    p1.disconnect();
  });
});
