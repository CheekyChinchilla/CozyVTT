/**
 * The initiative order reaches every screen in the right order, and is sent
 * again whenever a member's view of it changes.
 *
 * Two gaps since the order became per-recipient. A send captures the state,
 * then reads the combatants' tokens and each player's plane before emitting;
 * ending the fight replaced the state and finished its own (cheaper) send
 * first, so the earlier send's stale, still-active copy arrived last and
 * every client showed a fight that had ended. And a player's copy depends on
 * their plane, their role and each token, but it was only re-sent when a
 * combatant's own token changed: a plane crossing through another token, a
 * map switch, a promotion, a bound character's new picture and a deleted
 * token or map all left trackers stale.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma } from '../../config/database';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState, getState } from '../initiativeState';
import { createTestUser, TEST_PASSWORD } from '../../__tests__/helpers/db';

jest.setTimeout(30000);

const app = createTestApp();
const runId = randomUUID().slice(0, 8);
const email = (name: string) => `resend-${name}-${runId}@test.cozyvtt.local`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let mapA: string;
let mapB: string;
let characterId: string;
let gmCookie: string;
let playerCookie: string;
let gmRest: ReturnType<typeof request.agent>;
let playerRest: ReturnType<typeof request.agent>;

const HERO = 'hero', SCOUT = 'scout', WISP = 'wisp', HIDDEN = 'hidden';
const PICTURE = '/api/assets/tokens/00000000-0000-4000-8000-0000000000aa';

type Entry = { tokenId: string; imageUrl: string; hp: { current: number; max: number; temp: number } | null };
type State = { active: boolean; combatants: Entry[] };
const ids = (s: State) => s.combatants.map((c) => c.tokenId).sort();

const base = { imageUrl: '', size: { width: 1, height: 1 }, rotation: 0, conditions: [], metadata: {}, visible: true, layer: 'token', controlledBy: null };
const tokensA = () => [
  { ...base, id: HERO, name: 'Hero', position: { x: 1, y: 1 }, controlledBy: playerId, characterId, imageUrl: PICTURE, hp: { current: 4, max: 10, temp: 0 }, showHpBar: false },
  { ...base, id: SCOUT, name: 'Scout', position: { x: 2, y: 1 }, controlledBy: playerId },
  { ...base, id: WISP, name: 'Wisp', position: { x: 3, y: 3 }, layer: 'spirit' },
  { ...base, id: HIDDEN, name: 'Ambusher', position: { x: 4, y: 4 }, visible: false },
];
const mapData = (name: string) => ({
  campaignId, name, imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none', width: 10, height: 10, gridSize: 50, annotations: [],
});

beforeAll(async () => {
  const [gm, player] = await Promise.all(
    ['dm', 'player'].map((name) => createTestUser({ email: email(name), displayName: `Resend ${name}` }))
  );
  gmId = gm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Resend ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  characterId = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Hero', gameSystem: 'FIFTH_EDITION', data: {}, tokenImageUrl: PICTURE } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId] },
    ],
  });
  mapA = (await prisma.map.create({ data: { ...mapData('A'), tokens: tokensA() } })).id;
  mapB = (await prisma.map.create({ data: { ...mapData('B'), tokens: [] } })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapA } });

  server = await createWsTestServer();
  [gmCookie, playerCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(playerId)]);
  gmRest = request.agent(app);
  expect((await gmRest.post('/api/auth/login').send({ email: email('dm'), password: TEST_PASSWORD })).status).toBe(200);
  playerRest = request.agent(app);
  expect((await playerRest.post('/api/auth/login').send({ email: email('player'), password: TEST_PASSWORD })).status).toBe(200);
});

beforeEach(async () => {
  clearState(campaignId);
  await prisma.map.update({ where: { id: mapA }, data: { tokens: tokensA() } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapA, spiritLayerEnabled: false } });
  await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { role: 'PLAYER' } });
  await prisma.character.update({ where: { id: characterId }, data: { tokenImageUrl: PICTURE } });
});

afterAll(async () => {
  await server?.close();
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId] } } });
  await prisma.$disconnect();
});

type Client = Awaited<ReturnType<WsTestServer['connectAndAuth']>>;

/** Add combatants as the GM, waiting for each broadcast, then let the players' copies land. */
async function addAll(gm: Client, tokenIds: string[], mapId = mapA) {
  for (const tokenId of tokenIds) {
    const done = waitForEvent<State>(gm, 'initiative.state');
    gm.emit('initiative.add', { tokenId, mapId });
    await done;
  }
  await sleep(100);
}

describe('ending a fight', () => {
  it('ends it on every screen, even with an earlier send still in flight', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(gm, [HERO, HIDDEN]);
    const started = waitForEvent<State>(gm, 'initiative.state');
    gm.emit('initiative.start');
    await started;
    await sleep(100);

    const seen: State[] = [];
    player.on('initiative.state', (s: State) => { seen.push(s); });
    gm.emit('initiative.next');
    gm.emit('initiative.end');
    await sleep(800);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toMatchObject({ active: false, combatants: [] });
    gm.disconnect();
    player.disconnect();
  });
});

describe('the order is sent again when a member\'s view of it changes', () => {
  it("through a plane crossing by a token of theirs that is not in the order", async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(gm, [HERO, WISP]);

    const crossed = waitForEvent<State>(player, 'initiative.state');
    expect((await gmRest.put(`/api/campaigns/${campaignId}/maps/${mapA}/tokens/${SCOUT}`).send({ layer: 'spirit' })).status).toBe(200);
    // In the spirit realm now: the spirit-plane combatant, and not the material one.
    expect(ids(await crossed)).toEqual([WISP]);
    gm.disconnect();
    player.disconnect();
  });

  it('through the live toggle of any token, not only a combatant', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(gm, [HERO]);

    const toggled = waitForEvent<State>(player, 'initiative.state');
    gm.emit('spirit_layer.token.toggle', { mapId: mapA, tokenId: SCOUT, visible: false });
    expect(ids(await toggled)).toEqual([HERO]);
    gm.disconnect();
    player.disconnect();
  });

  // A player is sent the map the table is showing and no other, so a
  // combatant left behind on the old map leaves their tracker, and comes
  // back with the map.
  it('through a map switch, listing only what stands on the map shown', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(gm, [HERO]);

    const switched = waitForEvent<State>(player, 'initiative.state');
    expect((await gmRest.put(`/api/campaigns/${campaignId}/maps/${mapB}/set-current`)).status).toBe(200);
    expect(ids(await switched)).toEqual([]);

    const back = waitForEvent<State>(player, 'initiative.state');
    expect((await gmRest.put(`/api/campaigns/${campaignId}/maps/${mapA}/set-current`)).status).toBe(200);
    expect(ids(await back)).toEqual([HERO]);
    gm.disconnect();
    player.disconnect();
  });

  it('through a role change, so a demoted spectator no longer sees their old token\'s hit points', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(gm, [HERO]);

    const demoted = waitForEvent<State>(player, 'initiative.state');
    expect((await gmRest.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: 'SPECTATOR' })).status).toBe(200);
    const seen = await demoted;
    expect(ids(seen)).toEqual([HERO]);
    expect(seen.combatants[0].hp).toBeNull();
    gm.disconnect();
    player.disconnect();
  });

  it("through a bound character's new picture", async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await addAll(gm, [HERO]);

    const repainted = waitForEvent<State>(gm, 'initiative.state');
    expect((await playerRest.put(`/api/characters/${characterId}`).send({ tokenImageUrl: null })).status).toBe(200);
    expect((await repainted).combatants.find((c) => c.tokenId === HERO)?.imageUrl).toBe('');
    gm.disconnect();
  });
});

describe('a combatant whose token is gone', () => {
  it('leaves the order when its token is deleted', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await addAll(gm, [HERO, WISP]);

    const dropped = waitForEvent<State>(gm, 'initiative.state');
    expect((await gmRest.delete(`/api/campaigns/${campaignId}/maps/${mapA}/tokens/${WISP}`)).status).toBe(200);
    expect(ids(await dropped)).toEqual([HERO]);
    expect(getState(campaignId).combatants.map((c) => c.tokenId)).toEqual([HERO]);
    gm.disconnect();
  });

  it('leaves the order when its map is deleted', async () => {
    const mapC = (await prisma.map.create({ data: { ...mapData('C'), tokens: [{ ...base, id: 'rock', name: 'Rock', position: { x: 1, y: 1 } }] } })).id;
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    await addAll(gm, [HERO]);
    await addAll(gm, ['rock'], mapC);

    const dropped = waitForEvent<State>(gm, 'initiative.state');
    expect((await gmRest.delete(`/api/campaigns/${campaignId}/maps/${mapC}`)).status).toBe(200);
    expect(ids(await dropped)).toEqual([HERO]);
    gm.disconnect();
  });
});
