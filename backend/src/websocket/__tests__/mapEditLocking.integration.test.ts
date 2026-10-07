/**
 * Wall, light and fog edits sent together all land.
 *
 * Each of these handlers reads the map's whole list (or fog grid), changes it
 * and writes it back. The web client sends several at once: placing a door on
 * a wall is one wall:remove and up to three wall:add in the same tick, and a
 * player can toggle a door while the DM draws. Unserialised, every handler
 * read the same list and the last write won, so the screens showed the door
 * while the database kept the original wall. Every read-modify-write of a
 * map's walls, lights or fog now runs under the map's lock and reads the
 * stored value after taking it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dmCookie: string;
let playerCookie: string;

type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; type: string };
type Light = { id: string; x: number; y: number; brightRadius: number; dimRadius: number; color: string; enabled: boolean };

const wall = (x1: number, x2: number, type = 'wall', id = randomUUID()): Wall => ({ id, x1, y1: 100, x2, y2: 100, type });
const light = (x: number, id = randomUUID()): Light => ({ id, x, y: 300, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });

async function newMap(data: { wallSegments?: Wall[]; lights?: Light[]; fogEnabled?: boolean } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Locking', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
      fogEnabled: data.fogEnabled ?? false,
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

const storedWalls = async (mapId: string): Promise<Wall[]> =>
  (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true } })).wallSegments as unknown as Wall[];
const storedLights = async (mapId: string): Promise<Light[]> =>
  (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { lights: true } })).lights as unknown as Light[];
const byId = <T extends { id: string }>(list: T[]): T[] => [...list].sort((a, b) => a.id.localeCompare(b.id));

/** Resolve once `count` of `event` have arrived. */
function collect<T>(client: ClientSocket, event: string, count: number, timeoutMs = 5000): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const seen: T[] = [];
    const timer = setTimeout(() => {
      client.off(event, handler);
      reject(new Error(`collect: ${seen.length} of ${count} "${event}" within ${timeoutMs}ms`));
    }, timeoutMs);
    const handler = (data: T) => {
      seen.push(data);
      if (seen.length === count) {
        clearTimeout(timer);
        client.off(event, handler);
        resolve(seen);
      }
    };
    client.on(event, handler);
  });
}

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `mel-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Lock DM' } });
  const player = await prisma.user.create({ data: { email: `mel-pl-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Lock Player' } });
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Map edit locking ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
  playerCookie = await server.loginAs(playerId);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('walls', () => {
  it('stores a door placed on a wall: one remove and three adds sent together', async () => {
    const keep = wall(600, 700);
    const original = wall(100, 400);
    const mapId = await newMap({ wallSegments: [keep, original] });
    const left = wall(100, 200);
    const door = wall(200, 300, 'door-closed');
    const right = wall(300, 400);

    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const removed = collect(dm, 'wall:removed', 1);
    const added = collect(dm, 'wall:added', 3);
    dm.emit('wall:remove', { mapId, segmentId: original.id });
    dm.emit('wall:add', { mapId, segment: left });
    dm.emit('wall:add', { mapId, segment: door });
    dm.emit('wall:add', { mapId, segment: right });
    await removed;
    await added;

    expect(byId(await storedWalls(mapId))).toEqual(byId([keep, left, door, right]));
    dm.disconnect();
  });

  it('stores a wall split: one remove and two adds sent together', async () => {
    const original = wall(100, 400);
    const mapId = await newMap({ wallSegments: [original] });
    const a = wall(100, 250);
    const b = wall(250, 400);

    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const removed = collect(dm, 'wall:removed', 1);
    const added = collect(dm, 'wall:added', 2);
    dm.emit('wall:remove', { mapId, segmentId: original.id });
    dm.emit('wall:add', { mapId, segment: a });
    dm.emit('wall:add', { mapId, segment: b });
    await removed;
    await added;

    expect(byId(await storedWalls(mapId))).toEqual(byId([a, b]));
    dm.disconnect();
  });

  it("keeps a player's door toggle made while the DM adds walls", async () => {
    const door = wall(100, 200, 'door-closed');
    const mapId = await newMap({ wallSegments: [door] });
    const drawn = [wall(300, 400), wall(500, 600), wall(700, 800)];

    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const updated = collect(dm, 'wall:updated', 1);
    const added = collect(dm, 'wall:added', drawn.length);
    for (const segment of drawn) dm.emit('wall:add', { mapId, segment });
    player.emit('wall:update', { mapId, segment: { ...door, type: 'door-open' } });
    await updated;
    await added;

    expect(byId(await storedWalls(mapId))).toEqual(byId([{ ...door, type: 'door-open' }, ...drawn]));
    dm.disconnect();
    player.disconnect();
  });
});

describe('lights', () => {
  it('stores every light of a burst of adds, updates and removes', async () => {
    const moved = light(100);
    const gone = light(200);
    const mapId = await newMap({ lights: [moved, gone] });
    const placed = [light(300), light(400), light(500)];

    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const added = collect(dm, 'light:added', placed.length);
    const updated = collect(dm, 'light:updated', 1);
    const removed = collect(dm, 'light:removed', 1);
    for (const l of placed) dm.emit('light:add', { mapId, light: l });
    dm.emit('light:update', { mapId, light: { ...moved, x: 150 } });
    dm.emit('light:remove', { mapId, lightId: gone.id });
    await added;
    await updated;
    await removed;

    expect(byId(await storedLights(mapId))).toEqual(byId([{ ...moved, x: 150 }, ...placed]));
    dm.disconnect();
  });
});

describe('fog', () => {
  it('keeps both of two fog operations sent together', async () => {
    const mapId = await newMap({ fogEnabled: true });
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const updates = collect(dm, 'fog:updated', 2);
    dm.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: [0, 1, 2] } });
    dm.emit('fog:operation', { mapId, operation: { op: 'reveal', cells: [40, 41, 42] } });
    await updates;

    const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { fogData: true } });
    const revealed = (map.fogData as unknown as { revealed: boolean[] }).revealed;
    const open = revealed.flatMap((v, i) => (v ? [i] : []));
    expect(open).toEqual([0, 1, 2, 40, 41, 42]);
    dm.disconnect();
  });
});
