/**
 * A wall or light edit sent with an operation id is broadcast with it, so the
 * page that sent it can tell the echo of its own change from anyone else's.
 *
 * The DM's page used to skip every wall and light event as the echo of its
 * own edit, so a player's door toggle or a change made through the REST API
 * never reached it, and its next bulk edit sent the stale list back. Each
 * edit now carries a random id the server echoes; an event without one, such
 * as a REST change or the answer to walls:request, is never the page's own.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

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

async function newMap(data: { wallSegments?: Wall[]; lights?: Light[] } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Op ids', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `opid-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Op DM' } });
  const player = await prisma.user.create({ data: { email: `opid-pl-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Op Player' } });
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Op ids ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
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

describe('operation ids', () => {
  it('echoes the id an edit was sent with, to the sender and to everyone else', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const segment = wall(100, 200);

    const toDm = waitForEvent<{ opId?: string }>(dm, 'wall:added');
    const toPlayer = waitForEvent<{ opId?: string }>(player, 'wall:added');
    dm.emit('wall:add', { mapId, segment, opId: 'op-1' });

    expect((await toDm).opId).toBe('op-1');
    expect((await toPlayer).opId).toBe('op-1');
    dm.disconnect();
    player.disconnect();
  });

  it('sends no id for an edit sent without one, or with one that is not a short string', async () => {
    const mapId = await newMap();
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const plain = waitForEvent<Record<string, unknown>>(dm, 'light:added');
    dm.emit('light:add', { mapId, light: light(100) });
    expect(await plain).not.toHaveProperty('opId');

    const odd = waitForEvent<Record<string, unknown>>(dm, 'light:added');
    dm.emit('light:add', { mapId, light: light(200), opId: { not: 'a string' } });
    expect(await odd).not.toHaveProperty('opId');

    const long = waitForEvent<Record<string, unknown>>(dm, 'light:added');
    dm.emit('light:add', { mapId, light: light(300), opId: 'x'.repeat(65) });
    expect(await long).not.toHaveProperty('opId');
    dm.disconnect();
  });

  it("echoes a player's door toggle with its id", async () => {
    const door = wall(100, 200, 'door-closed');
    const mapId = await newMap({ wallSegments: [door] });
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const toDm = waitForEvent<{ opId?: string }>(dm, 'wall:updated');
    player.emit('wall:update', { mapId, segment: { ...door, type: 'door-open' }, opId: 'door-1' });

    expect((await toDm).opId).toBe('door-1');
    dm.disconnect();
    player.disconnect();
  });

  it('echoes the id on every wall and light event', async () => {
    const door = wall(100, 200, 'door-closed');
    const lamp = light(100);
    const mapId = await newMap({ wallSegments: [door], lights: [lamp] });
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const sent: Array<[string, object, string]> = [
      ['light:add', { light: light(500) }, 'light:added'],
      ['wall:update', { segment: { ...door, type: 'door-open' } }, 'wall:updated'],
      ['walls:replace', { segments: [door] }, 'walls:replaced'],
      ['wall:remove', { segmentId: door.id }, 'wall:removed'],
      ['light:update', { light: { ...lamp, x: 150 } }, 'light:updated'],
      ['lights:replace', { lights: [lamp] }, 'lights:replaced'],
      ['light:remove', { lightId: lamp.id }, 'light:removed'],
    ];
    for (const [event, body, broadcast] of sent) {
      const opId = `id-${event.replace(':', '-')}`;
      const echo = waitForEvent<{ opId?: string }>(dm, broadcast);
      dm.emit(event, { mapId, ...body, opId });
      expect((await echo).opId).toBe(opId);
    }
    dm.disconnect();
  });

  it('answers walls:request and lights:request without an id', async () => {
    const mapId = await newMap({ wallSegments: [wall(100, 200)], lights: [light(100)] });
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const walls = waitForEvent<Record<string, unknown>>(dm, 'walls:replaced');
    const lights = waitForEvent<Record<string, unknown>>(dm, 'lights:replaced');
    dm.emit('walls:request', { mapId, opId: 'should-not-echo' });
    dm.emit('lights:request', { mapId, opId: 'should-not-echo' });
    expect(await walls).not.toHaveProperty('opId');
    expect(await lights).not.toHaveProperty('opId');
    await expectNoEvent(dm, 'error', 200);
    dm.disconnect();
  });
});
