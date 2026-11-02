/**
 * The edits that add walls and lights can be answered.
 *
 * The DM's page draws a wall or a light as it sends it. A refused add was an
 * `error` event that named nothing, so the page could not tell which of its
 * edits had been refused and kept drawing it. `wall:add`, `walls:replace`
 * and `light:add` sent with an acknowledgement are now answered once,
 * `{ ok: true }` or `{ ok: false, error }`, with no `error` event, the flood
 * ceiling included. Without one, a refusal is still an `error` event.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { toJson } from '../../utils/prisma-json';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { MAX_LIGHT_SOURCES, MAX_WALL_SEGMENTS, TOO_MANY_LIGHTS_MESSAGE, TOO_MANY_WALLS_MESSAGE } from '../../validators/walls';
import { MAP_EDITS_PER_SECOND, TOO_MANY_MAP_EDITS_MESSAGE } from '../shared';

jest.setTimeout(30000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dmCookie: string;
let playerCookie: string;

type Answer = { ok: true } | { ok: false; error: string };

const wall = () => ({ id: randomUUID(), x1: 100, y1: 100, x2: 300, y2: 100, type: 'wall' });
const light = () => ({ id: randomUUID(), x: 500, y: 500, brightRadius: 2, dimRadius: 4, color: '#ffcc66', enabled: true });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A map of the campaign, empty or already holding as many walls and lights as a map may. */
async function mapOf(full: boolean): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId, name: full ? 'Full' : 'Empty', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize: 50, tokens: [], annotations: [],
      wallSegments: toJson(full ? Array.from({ length: MAX_WALL_SEGMENTS }, wall) : []),
      lights: toJson(full ? Array.from({ length: MAX_LIGHT_SOURCES }, light) : []),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
  return map.id;
}
const counts = async (mapId: string) => {
  const map = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true, lights: true } });
  return { walls: (map.wallSegments as unknown[]).length, lights: (map.lights as unknown[]).length };
};

/** Send an edit with an acknowledgement, and the answer, which must come with no `error` event. */
async function asked(page: ClientSocket, event: string, data: object): Promise<Answer> {
  const noError = expectNoEvent(page, 'error', 500);
  const answer = await new Promise<Answer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer to ${event}`)), 5000);
    page.emit(event, data, (reply: Answer) => { clearTimeout(timer); resolve(reply); });
  });
  await noError;
  return answer;
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: `wallanswers-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Answers ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Wall answers ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

beforeEach(async () => {
  // A fresh second for the edit ceiling.
  await sleep(1100);
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('wall:add', () => {
  it('answers ok for a wall it stores', async () => {
    const mapId = await mapOf(false);
    const page = await server.connectAndAuth(dmCookie, campaignId);

    expect(await asked(page, 'wall:add', { mapId, segment: wall() })).toEqual({ ok: true });
    expect((await counts(mapId)).walls).toBe(1);
    page.disconnect();
  });

  it('answers the refusal of a wall past the cap', async () => {
    const mapId = await mapOf(true);
    const page = await server.connectAndAuth(dmCookie, campaignId);

    expect(await asked(page, 'wall:add', { mapId, segment: wall() })).toEqual({ ok: false, error: TOO_MANY_WALLS_MESSAGE });
    expect((await counts(mapId)).walls).toBe(MAX_WALL_SEGMENTS);
    page.disconnect();
  });

  it('answers any other refusal the same way', async () => {
    const mapId = await mapOf(false);
    const page = await server.connectAndAuth(dmCookie, campaignId);

    expect(await asked(page, 'wall:add', { mapId: randomUUID(), segment: wall() })).toEqual({ ok: false, error: 'Map not found' });
    expect(await asked(page, 'wall:add', { mapId, segment: { ...wall(), x2: 'far' } })).toMatchObject({ ok: false });
    page.disconnect();
    const player = await server.connectAndAuth(playerCookie, campaignId);
    expect(await asked(player, 'wall:add', { mapId, segment: wall() })).toEqual({ ok: false, error: 'Only DMs can add wall segments' });
    player.disconnect();
  });

  it('answers an add past the edit ceiling, where it was dropped without a word', async () => {
    const mapId = await mapOf(false);
    const page = await server.connectAndAuth(dmCookie, campaignId);

    const answers = await Promise.all(Array.from({ length: MAP_EDITS_PER_SECOND + 1 }, () =>
      new Promise<Answer>((resolve) => { page.emit('wall:add', { mapId, segment: wall() }, resolve); })));

    expect(answers.filter((a) => a.ok)).toHaveLength(MAP_EDITS_PER_SECOND);
    expect(answers.filter((a) => !a.ok)).toEqual([{ ok: false, error: TOO_MANY_MAP_EDITS_MESSAGE }]);
    page.disconnect();
  });

  it('still refuses with an error event when sent without an acknowledgement', async () => {
    const mapId = await mapOf(true);
    const page = await server.connectAndAuth(dmCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(page, 'error');

    page.emit('wall:add', { mapId, segment: wall() });

    expect((await refused).message).toBe(TOO_MANY_WALLS_MESSAGE);
    page.disconnect();
  });
});

describe('walls:replace', () => {
  it('answers ok for a list it stores, and the refusal of one past the cap', async () => {
    const mapId = await mapOf(false);
    const page = await server.connectAndAuth(dmCookie, campaignId);

    expect(await asked(page, 'walls:replace', { mapId, segments: [wall(), wall()] })).toEqual({ ok: true });
    expect(await asked(page, 'walls:replace', { mapId, segments: Array.from({ length: MAX_WALL_SEGMENTS + 1 }, wall) }))
      .toEqual({ ok: false, error: TOO_MANY_WALLS_MESSAGE });
    expect((await counts(mapId)).walls).toBe(2);
    page.disconnect();
  });
});

describe('light:add', () => {
  it('answers ok for a light it stores, and the refusal of one past the cap', async () => {
    const roomy = await mapOf(false);
    const page = await server.connectAndAuth(dmCookie, campaignId);
    expect(await asked(page, 'light:add', { mapId: roomy, light: light() })).toEqual({ ok: true });
    expect((await counts(roomy)).lights).toBe(1);

    const full = await mapOf(true);
    expect(await asked(page, 'light:add', { mapId: full, light: light() })).toEqual({ ok: false, error: TOO_MANY_LIGHTS_MESSAGE });
    expect((await counts(full)).lights).toBe(MAX_LIGHT_SOURCES);
    page.disconnect();
  });
});
