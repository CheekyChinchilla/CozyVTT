/**
 * The DM adds many walls to a map in one request.
 *
 * Mapmaker's Save added each wall of the rooms painted as a request of its
 * own, each a locked rewrite of the map's walls and each counted against the
 * shared rate limit. The batch add takes the lock once and judges each wall
 * as the single add does, in order: one too far outside the map, one past
 * the map's cap (counting those added before it) or one whose id the map
 * already holds is skipped, and the rest are added. The answer lists both,
 * and open pages hear of it once.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, expectNoEvent, waitForEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';
import type { Prisma } from '@prisma/client';
import { withMapsLocked, writersWaitingFor } from '../../utils/mapTokens';
import * as shared from '../../websocket/shared';
import { DUPLICATE_WALL_ID_MESSAGE, MAX_WALL_SEGMENTS, TOO_MANY_WALLS_MESSAGE } from '../../validators/walls';
import { WALL_OUTSIDE_MAP_MESSAGE } from '../../validators/maps';

jest.setTimeout(30000);

const app = createTestApp();
const users: string[] = [];
const campaigns: string[] = [];
let campaignId: string;
let otherCampaignId: string;
let dmId: string;
let playerId: string;
let dm: request.Agent;
let player: request.Agent;
let spectator: request.Agent;
let stranger: request.Agent;
let server: WsTestServer;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A wall inside every map below, with its own id unless one is given. */
const wall = (x = 100, id: string = randomUUID()) => ({ id, x1: x, y1: 100, x2: x, y2: 200, type: 'wall' });
/** At 10,000 px: past the edge of a 20 square map at 10 px a square (5,200 px with its margin). */
const outside = () => ({ id: randomUUID(), x1: 100, y1: 100, x2: 10000, y2: 100, type: 'wall' });

interface BatchAnswer {
  added: Array<{ id: string; x1: number; type: string }>;
  skipped: Array<{ index: number; reason: string }>;
  total: number;
}

async function newMap(walls: unknown[] = [], campaign = campaignId, gridSize = 10): Promise<string> {
  const map = await prisma.map.create({
    data: {
      campaignId: campaign, name: 'Rooms', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 20, height: 20, gridSize, tokens: [], annotations: [], wallSegments: toJson(walls), lights: [],
    },
  });
  return map.id;
}
const storedWalls = async (mapId: string) =>
  (await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { wallSegments: true } })).wallSegments as Array<{ id: string; x1: number }>;
const batchUrl = (mapId: string, campaign = campaignId) => `/api/campaigns/${campaign}/maps/${mapId}/walls/batch`;

async function member(role: 'DM' | 'PLAYER' | 'SPECTATOR', campaign: string): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: `Batch ${role}` });
  users.push(user.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign, role, characterIds: [] } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

beforeAll(async () => {
  const owner = await createTestUser({ displayName: 'Batch owner' });
  users.push(owner.id);
  dmId = owner.id;
  campaignId = (await createTestCampaign(owner.id)).id;
  campaigns.push(campaignId);
  await prisma.campaignMembership.create({ data: { userId: owner.id, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: owner.email, password: TEST_PASSWORD })).status).toBe(200);

  const p = await member('PLAYER', campaignId);
  playerId = p.id;
  player = p.agent;
  spectator = (await member('SPECTATOR', campaignId)).agent;

  const otherOwner = await createTestUser({ displayName: 'Other DM' });
  users.push(otherOwner.id);
  otherCampaignId = (await createTestCampaign(otherOwner.id)).id;
  campaigns.push(otherCampaignId);
  stranger = (await member('DM', otherCampaignId)).agent;

  server = await createWsTestServer();
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.updateMany({ where: { id: { in: campaigns } }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId: { in: campaigns } } });
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

describe('the DM', () => {
  it('adds every wall in one request, in order, giving an id to each that has none', async () => {
    const mapId = await newMap();
    const named = wall(100);
    const { id: _a, ...unnamed1 } = wall(110);
    const { id: _b, ...unnamed2 } = wall(120);
    const res = await dm.post(batchUrl(mapId)).send({ segments: [named, unnamed1, unnamed2] });

    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.skipped).toEqual([]);
    expect(body.total).toBe(3);
    expect(body.added.map((w) => w.x1)).toEqual([100, 110, 120]);
    expect(body.added[0].id).toBe(named.id);
    expect(body.added.every((w) => UUID.test(w.id))).toBe(true);
    expect(new Set(body.added.map((w) => w.id)).size).toBe(3);
    expect(await storedWalls(mapId)).toEqual(body.added);
  });

  it('adds the walls after those the map holds already', async () => {
    const first = wall(50);
    const mapId = await newMap([first]);
    const res = await dm.post(batchUrl(mapId)).send({ segments: [wall(60), wall(70)] });
    expect(res.status).toBe(200);
    expect((res.body as BatchAnswer).total).toBe(3);
    expect((await storedWalls(mapId)).map((w) => w.x1)).toEqual([50, 60, 70]);
  });

  it('adds the valid walls and reports each one skipped, with its place in the request and why', async () => {
    const onMap = wall(50);
    const mapId = await newMap([onMap]);
    const kept1 = wall(60);
    const kept2 = wall(70);
    const res = await dm.post(batchUrl(mapId)).send({ segments: [kept1, outside(), wall(80, onMap.id), kept2] });

    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.added.map((w) => w.id)).toEqual([kept1.id, kept2.id]);
    expect(body.skipped).toEqual([
      { index: 1, reason: WALL_OUTSIDE_MAP_MESSAGE },
      { index: 2, reason: DUPLICATE_WALL_ID_MESSAGE },
    ]);
    expect(body.total).toBe(3);
    expect((await storedWalls(mapId)).map((w) => w.id)).toEqual([onMap.id, kept1.id, kept2.id]);
  });

  it('skips a wall whose id an earlier wall in the same request took', async () => {
    const mapId = await newMap();
    const id = randomUUID();
    const res = await dm.post(batchUrl(mapId)).send({ segments: [wall(60, id), wall(70, id)] });
    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.added.map((w) => w.x1)).toEqual([60]);
    expect(body.skipped).toEqual([{ index: 1, reason: DUPLICATE_WALL_ID_MESSAGE }]);
    expect(body.total).toBe(1);
  });

  it('counts the walls added earlier in the request against the map\'s cap', async () => {
    const mapId = await newMap(Array.from({ length: MAX_WALL_SEGMENTS - 2 }, () => wall()));
    const res = await dm.post(batchUrl(mapId)).send({ segments: [wall(60), wall(70), wall(80), wall(90)] });
    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.added.map((w) => w.x1)).toEqual([60, 70]);
    expect(body.skipped).toEqual([
      { index: 2, reason: TOO_MANY_WALLS_MESSAGE },
      { index: 3, reason: TOO_MANY_WALLS_MESSAGE },
    ]);
    expect(body.total).toBe(MAX_WALL_SEGMENTS);
    expect(await storedWalls(mapId)).toHaveLength(MAX_WALL_SEGMENTS);
  });

  // Every wall judged and none fit: the request was sound, and the answer
  // says why each was not added, as it does when some are.
  it('answers 200 with nothing added when every wall is skipped', async () => {
    const onMap = wall(50);
    const mapId = await newMap([onMap]);
    const res = await dm.post(batchUrl(mapId)).send({ segments: [outside(), wall(60, onMap.id)] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      added: [],
      skipped: [{ index: 0, reason: WALL_OUTSIDE_MAP_MESSAGE }, { index: 1, reason: DUPLICATE_WALL_ID_MESSAGE }],
      total: 1,
    });
    expect(await storedWalls(mapId)).toEqual([onMap]);
  });

  it('answers 200 with nothing added for an empty list', async () => {
    const mapId = await newMap();
    const res = await dm.post(batchUrl(mapId)).send({ segments: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ added: [], skipped: [], total: 0 });
  });
});

describe('a request that is not a list of walls', () => {
  it.each([
    ['no list', {}],
    ['a list that is not one', { segments: 'walls' }],
    ['a wall that is not one', { segments: [{ x1: 0, y1: 0, x2: 10, y2: 0, type: 'lava' }] }],
    ['a wall that is not an object', { segments: [7] }],
  ])('is refused with 400: %s', async (_what, body) => {
    const mapId = await newMap();
    const res = await dm.post(batchUrl(mapId)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
    expect(await storedWalls(mapId)).toEqual([]);
  });

  it('is refused with 400 when it holds more walls than a map can', async () => {
    const mapId = await newMap();
    const segments = Array.from({ length: MAX_WALL_SEGMENTS + 1 }, () => ({ x1: 0, y1: 0, x2: 10, y2: 0, type: 'wall' }));
    const res = await dm.post(batchUrl(mapId)).send({ segments });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Validation Error', message: TOO_MANY_WALLS_MESSAGE });
    expect(await storedWalls(mapId)).toEqual([]);
  });

  it('names the wall that is not one', async () => {
    const mapId = await newMap();
    const res = await dm.post(batchUrl(mapId)).send({ segments: [wall(), { ...wall(), type: 'lava' }] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Wall 1: /);
  });
});

describe('anyone but the DM', () => {
  it.each([
    ['a player', () => player, 403],
    ['a spectator', () => spectator, 403],
    ['the DM of another campaign', () => stranger, 403],
    ['someone not signed in', () => request(app), 401],
  ])('is refused: %s', async (_who, agent, status) => {
    const mapId = await newMap();
    const res = await agent().post(batchUrl(mapId)).send({ segments: [wall()] });
    expect(res.status).toBe(status);
    expect(await storedWalls(mapId)).toEqual([]);
  });

  it('cannot reach a map of another campaign through their own', async () => {
    const mapId = await newMap([], otherCampaignId);
    const res = await dm.post(batchUrl(mapId)).send({ segments: [wall()] });
    expect(res.status).toBe(404);
    expect(await storedWalls(mapId)).toEqual([]);
  });
});

describe('open pages', () => {
  it('hear of the walls added once, a locked door reaching a player as a closed one, and sight is sent again once', async () => {
    const mapId = await newMap();
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
    const resend = jest.spyOn(shared, 'resendSightAfterChange');
    const playerPage = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      let heard = 0;
      playerPage.on('walls:replaced', () => { heard += 1; });
      const noSingles = expectNoEvent(playerPage, 'wall:added', 800);
      const toPlayer = waitForEvent<{ mapId: string; segments: Array<{ type: string }> }>(playerPage, 'walls:replaced');
      const toDm = waitForEvent<{ mapId: string; segments: Array<{ type: string }> }>(dmPage, 'walls:replaced');
      const door = { ...wall(70), type: 'door-locked' };
      const res = await dm.post(batchUrl(mapId)).send({ segments: [wall(60), door, outside()] });
      expect(res.status).toBe(200);

      expect((await toPlayer)).toMatchObject({ mapId, segments: [{ type: 'wall' }, { type: 'door-closed' }] });
      expect((await toDm).segments.map((w) => w.type)).toEqual(['wall', 'door-locked']);
      await noSingles;
      expect(heard).toBe(1);
      expect(resend).toHaveBeenCalledTimes(1);
      expect(resend).toHaveBeenCalledWith(expect.anything(), campaignId, mapId);
    } finally {
      playerPage.disconnect();
      dmPage.disconnect();
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    }
  });

  it('hear nothing, and no sight is sent, when no wall was added', async () => {
    const mapId = await newMap();
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
    const resend = jest.spyOn(shared, 'resendSightAfterChange');
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      const quiet = expectNoEvent(dmPage, 'walls:replaced', 800);
      const res = await dm.post(batchUrl(mapId)).send({ segments: [outside()] });
      expect(res.status).toBe(200);
      expect((res.body as BatchAnswer).added).toEqual([]);
      await quiet;
      expect(resend).not.toHaveBeenCalled();
    } finally {
      dmPage.disconnect();
      await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    }
  });
});

/** Until a write waits in line for the map's lock: it has read the map by then. */
async function writeWaitingForLock(mapId: string): Promise<void> {
  for (let tries = 0; tries < 100; tries++) {
    if (writersWaitingFor(mapId) > 0) return;
    await pause(50);
  }
  throw new Error('the write never reached the map lock');
}

/**
 * Hold the map's lock, send `segments`, and once the batch waits for the lock
 * write `change` to the map and commit. Resolves with the batch's answer.
 */
async function batchWhileMapChanges(mapId: string, segments: unknown[], change: Prisma.MapUpdateInput) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const holding = new Promise<void>((resolve) => { locked = resolve; });
  const holder = withMapsLocked([mapId], async (tx) => {
    locked();
    await gate;
    await tx.map.update({ where: { id: mapId }, data: change });
  });
  await holding;
  const answer = dm.post(batchUrl(mapId)).send({ segments }).then((r) => r);
  await writeWaitingForLock(mapId);
  release();
  await holder;
  return answer;
}

describe('a batch judged against the map as it is under the lock', () => {
  // At 10,000 px a wall fits the margin at a 50 px grid (26,000) and not at a 10 px one (5,200).
  it('skips a wall the grid cut from 50 to 10 puts too far off the map, while it waited', async () => {
    const mapId = await newMap([], campaignId, 50);
    const kept = wall(60);
    const farOut = { id: randomUUID(), x1: 100, y1: 100, x2: 10000, y2: 100, type: 'wall' };
    const res = await batchWhileMapChanges(mapId, [kept, farOut], { gridSize: 10 });
    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.added.map((w) => w.id)).toEqual([kept.id]);
    expect(body.skipped).toEqual([{ index: 1, reason: WALL_OUTSIDE_MAP_MESSAGE }]);
    expect((await storedWalls(mapId)).map((w) => w.id)).toEqual([kept.id]);
  });

  it('counts the walls another write added while it waited against the cap', async () => {
    const mapId = await newMap();
    const res = await batchWhileMapChanges(mapId, [wall(60), wall(70), wall(80)], {
      wallSegments: toJson(Array.from({ length: MAX_WALL_SEGMENTS - 1 }, () => wall())),
    });
    expect(res.status).toBe(200);
    const body = res.body as BatchAnswer;
    expect(body.added.map((w) => w.x1)).toEqual([60]);
    expect(body.skipped).toEqual([
      { index: 1, reason: TOO_MANY_WALLS_MESSAGE },
      { index: 2, reason: TOO_MANY_WALLS_MESSAGE },
    ]);
    expect(body.total).toBe(MAX_WALL_SEGMENTS);
    expect(await storedWalls(mapId)).toHaveLength(MAX_WALL_SEGMENTS);
  });
});

describe('a map deleted while the request waits for its lock', () => {
  it('is answered as not there, with nothing sent to open pages', async () => {
    const mapId = await newMap();
    const resend = jest.spyOn(shared, 'resendSightAfterChange');
    const dmPage = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    try {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      let locked!: () => void;
      const holding = new Promise<void>((resolve) => { locked = resolve; });
      const holder = withMapsLocked([mapId], async (tx) => {
        locked();
        await gate;
        await tx.map.delete({ where: { id: mapId } });
      });
      await holding;
      const quiet = expectNoEvent(dmPage, 'walls:replaced', 800);
      const answer = dm.post(batchUrl(mapId)).send({ segments: [wall()] }).then((r) => r);
      await writeWaitingForLock(mapId);
      release();
      await holder;
      const res = await answer;
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Not Found', message: 'Map not found' });
      await quiet;
      expect(resend).not.toHaveBeenCalled();
    } finally {
      dmPage.disconnect();
    }
  });
});
