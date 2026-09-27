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
let dmId: string;
let playerId: string;
let campaignId: string;
let mapA: string;
let mapB: string;
let characterId: string;
let dmCookie: string;
let playerCookie: string;
let dmRest: ReturnType<typeof request.agent>;
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
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) => createTestUser({ email: email(name), displayName: `Resend ${name}` }))
  );
  dmId = dm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Resend ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  characterId = (await prisma.character.create({ data: { userId: playerId, campaignId, name: 'Hero', gameSystem: 'DND_5E', data: {}, tokenImageUrl: PICTURE } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId] },
    ],
  });
  mapA = (await prisma.map.create({ data: { ...mapData('A'), tokens: tokensA() } })).id;
  mapB = (await prisma.map.create({ data: { ...mapData('B'), tokens: [] } })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapA } });

  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
  dmRest = request.agent(app);
  expect((await dmRest.post('/api/auth/login').send({ email: email('dm'), password: TEST_PASSWORD })).status).toBe(200);
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
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

type Client = Awaited<ReturnType<WsTestServer['connectAndAuth']>>;

/** Add combatants as the DM, waiting for each broadcast, then let the players' copies land. */
async function addAll(dm: Client, tokenIds: string[], mapId = mapA) {
  for (const tokenId of tokenIds) {
    const done = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId, mapId });
    await done;
  }
  await sleep(100);
}

describe('ending a fight', () => {
  it('ends it on every screen, even with an earlier send still in flight', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(dm, [HERO, HIDDEN]);
    const started = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.start');
    await started;
    await sleep(100);

    const seen: State[] = [];
    player.on('initiative.state', (s: State) => { seen.push(s); });
    dm.emit('initiative.next');
    dm.emit('initiative.end');
    await sleep(800);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toMatchObject({ active: false, combatants: [] });
    dm.disconnect();
    player.disconnect();
  });
});

describe('the order is sent again when a member\'s view of it changes', () => {
  it("through a plane crossing by a token of theirs that is not in the order", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(dm, [HERO, WISP]);

    const crossed = waitForEvent<State>(player, 'initiative.state');
    expect((await dmRest.put(`/api/campaigns/${campaignId}/maps/${mapA}/tokens/${SCOUT}`).send({ layer: 'spirit' })).status).toBe(200);
    // In the spirit realm now: the spirit-plane combatant, and not the material one.
    expect(ids(await crossed)).toEqual([WISP]);
    dm.disconnect();
    player.disconnect();
  });

  it('through the live toggle of any token, not only a combatant', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(dm, [HERO]);

    const toggled = waitForEvent<State>(player, 'initiative.state');
    dm.emit('spirit_layer.token.toggle', { mapId: mapA, tokenId: SCOUT, visible: false });
    expect(ids(await toggled)).toEqual([HERO]);
    dm.disconnect();
    player.disconnect();
  });

  it('through a map switch', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(dm, [HERO]);

    const switched = waitForEvent<State>(player, 'initiative.state');
    expect((await dmRest.put(`/api/campaigns/${campaignId}/maps/${mapB}/set-current`)).status).toBe(200);
    expect(ids(await switched)).toEqual([HERO]);
    dm.disconnect();
    player.disconnect();
  });

  it('through a role change, so a demoted spectator no longer sees their old token\'s hit points', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    await addAll(dm, [HERO]);

    const demoted = waitForEvent<State>(player, 'initiative.state');
    expect((await dmRest.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: 'SPECTATOR' })).status).toBe(200);
    const seen = await demoted;
    expect(ids(seen)).toEqual([HERO]);
    expect(seen.combatants[0].hp).toBeNull();
    dm.disconnect();
    player.disconnect();
  });

  it("through a bound character's new picture", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    await addAll(dm, [HERO]);

    const repainted = waitForEvent<State>(dm, 'initiative.state');
    expect((await playerRest.put(`/api/characters/${characterId}`).send({ tokenImageUrl: null })).status).toBe(200);
    expect((await repainted).combatants.find((c) => c.tokenId === HERO)?.imageUrl).toBe('');
    dm.disconnect();
  });
});

describe('a combatant whose token is gone', () => {
  it('leaves the order when its token is deleted', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    await addAll(dm, [HERO, WISP]);

    const dropped = waitForEvent<State>(dm, 'initiative.state');
    expect((await dmRest.delete(`/api/campaigns/${campaignId}/maps/${mapA}/tokens/${WISP}`)).status).toBe(200);
    expect(ids(await dropped)).toEqual([HERO]);
    expect(getState(campaignId).combatants.map((c) => c.tokenId)).toEqual([HERO]);
    dm.disconnect();
  });

  it('leaves the order when its map is deleted', async () => {
    const mapC = (await prisma.map.create({ data: { ...mapData('C'), tokens: [{ ...base, id: 'rock', name: 'Rock', position: { x: 1, y: 1 } }] } })).id;
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    await addAll(dm, [HERO]);
    await addAll(dm, ['rock'], mapC);

    const dropped = waitForEvent<State>(dm, 'initiative.state');
    expect((await dmRest.delete(`/api/campaigns/${campaignId}/maps/${mapC}`)).status).toBe(200);
    expect(ids(await dropped)).toEqual([HERO]);
    dm.disconnect();
  });
});
