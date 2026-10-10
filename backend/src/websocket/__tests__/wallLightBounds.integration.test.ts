/**
 * The socket wall and light edits hold walls and lights to the same bounds
 * as the REST routes: no coordinate past 250,000 pixels, and nothing more
 * than 500 squares outside the map. See wallLightBounds.e2e.test.ts.
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
let campaignId: string;
let dmCookie: string;

// 20 by 20 squares at 50 px; 500 squares past the edge is 25,000 px.
const FAR_OFF = 1e7;
const PAST_MARGIN = 1000 + 25000 + 50;

const wall = (over: Record<string, unknown> = {}) => ({ id: randomUUID(), x1: 100, y1: 100, x2: 300, y2: 100, type: 'wall', ...over });
const light = (over: Record<string, unknown> = {}) => ({
  id: randomUUID(), x: 500, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true, ...over,
});

async function newMap(data: { wallSegments?: unknown[]; lights?: unknown[] } = {}): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Socket bounds', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(data.wallSegments ?? []), lights: toJson(data.lights ?? []),
    },
  });
  return map.id;
}
const stored = (mapId: string) => prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });

beforeAll(async () => {
  const dm = await prisma.user.create({ data: { email: `wlb-dm-${runId}@test.cozyvtt.local`, passwordHash: 'x', displayName: 'Bounds DM' } });
  dmId = dm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Socket bounds ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: dmId } });
  await prisma.$disconnect();
});

/** Emit as the DM and expect a refusal: an error, no broadcast, nothing stored. */
async function refused(event: string, payload: object, broadcast: string): Promise<string> {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const error = waitForEvent<{ message: string }>(dm, 'error');
  const none = expectNoEvent(dm, broadcast, 500);
  dm.emit(event, payload);
  const { message } = await error;
  await none;
  dm.disconnect();
  return message;
}

describe.each([['ten million pixels away', FAR_OFF], ['more than 500 squares off the map', PAST_MARGIN]])(
  'a wall or light %s',
  (_label, far) => {
    it('wall:add is refused', async () => {
      const mapId = await newMap();
      await refused('wall:add', { mapId, segment: wall({ x2: far }) }, 'wall:added');
      expect((await stored(mapId)).wallSegments).toEqual([]);
    });

    it('wall:update is refused, and the wall stays where it was', async () => {
      const existing = wall();
      const mapId = await newMap({ wallSegments: [existing] });
      await refused('wall:update', { mapId, segment: { ...existing, y1: far } }, 'wall:updated');
      expect((await stored(mapId)).wallSegments).toEqual([existing]);
    });

    it('walls:replace is refused', async () => {
      const mapId = await newMap();
      await refused('walls:replace', { mapId, segments: [wall(), wall({ x1: -far })] }, 'walls:replaced');
      expect((await stored(mapId)).wallSegments).toEqual([]);
    });

    it('light:add is refused', async () => {
      const mapId = await newMap();
      await refused('light:add', { mapId, light: light({ x: far }) }, 'light:added');
      expect((await stored(mapId)).lights).toEqual([]);
    });

    it('light:update is refused, and the light stays where it was', async () => {
      const existing = light();
      const mapId = await newMap({ lights: [existing] });
      await refused('light:update', { mapId, light: { ...existing, y: far } }, 'light:updated');
      expect((await stored(mapId)).lights).toEqual([existing]);
    });

    it('lights:replace is refused', async () => {
      const mapId = await newMap();
      await refused('lights:replace', { mapId, lights: [light({ y: far })] }, 'lights:replaced');
      expect((await stored(mapId)).lights).toEqual([]);
    });
  }
);

it('walls:replace keeps a wall stored outside the bounds before they existed, sent back unchanged', async () => {
  const legacy = wall({ x2: PAST_MARGIN });
  const mapId = await newMap({ wallSegments: [legacy] });
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const replaced = waitForEvent(dm, 'walls:replaced');

  dm.emit('walls:replace', { mapId, segments: [legacy, wall()] });

  await replaced;
  expect((await stored(mapId)).wallSegments).toHaveLength(2);
  dm.disconnect();
});
