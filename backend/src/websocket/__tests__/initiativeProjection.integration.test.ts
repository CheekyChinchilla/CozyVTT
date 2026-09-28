/**
 * The initiative order reaches each member as they may see it.
 *
 * It used to go to the whole room as stored: every combatant, hidden tokens
 * included, with the hit points copied when it joined. A player is now sent
 * only the combatants whose token they are sent at all, with the hit points
 * the map itself would show them; the DM gets everything, live.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState } from '../initiativeState';
import { readTokens, toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `init-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let p1Id: string;
let specId: string;
let campaignId: string;
let mapId: string;
let cryptId: string;
let dmCookie: string;
let p1Cookie: string;
let specCookie: string;

type Entry = { tokenId: string; hp: { current: number; max: number; temp: number } | null; name: string; type?: string };
type State = { active: boolean; currentTokenId: string | null; combatants: Entry[] };

const HERO = 'hero', GOBLIN = 'goblin', SHOWN = 'shown', HIDDEN = 'hidden', VEILED = 'veiled', SPIRIT = 'spirit', LURKER = 'lurker';
const hp = (current: number, max: number) => ({ current, max, temp: 0 });

beforeAll(async () => {
  const [dm, p1, spec] = await Promise.all(
    ['dm', 'p1', 'spec'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Init ${name}` } })
    )
  );
  dmId = dm.id; p1Id = p1.id; specId = spec.id;
  const campaign = await prisma.campaign.create({ data: { name: `Init ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: specId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {} };
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Init Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [
        { ...base, id: HERO, name: 'Hero', position: { x: 1, y: 1 }, visible: true, controlledBy: p1Id, hp: hp(4, 10), showHpBar: false },
        { ...base, id: GOBLIN, name: 'Goblin', position: { x: 2, y: 2 }, visible: true, controlledBy: null, hp: hp(7, 7), showHpBar: false },
        { ...base, id: SHOWN, name: 'Ogre', position: { x: 3, y: 3 }, visible: true, controlledBy: null, hp: hp(5, 9), showHpBar: true },
        { ...base, id: HIDDEN, name: 'Ambusher', position: { x: 4, y: 4 }, visible: false, controlledBy: null, hp: hp(6, 6), showHpBar: false },
        { ...base, id: VEILED, name: 'Something Large', position: { x: 5, y: 5 }, visible: true, controlledBy: dmId, type: 'player', hp: hp(30, 30), showHpBar: true, obscured: true },
        { ...base, id: SPIRIT, name: 'Wisp', position: { x: 6, y: 6 }, visible: true, controlledBy: null, hp: hp(3, 3), showHpBar: false, layer: 'spirit' },
      ],
    },
  });
  mapId = map.id;
  // The map the table is showing; a player is sent that one and no other.
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  // A map the DM has prepared, with a visible creature waiting on it.
  cryptId = (await prisma.map.create({
    data: {
      campaignId, name: 'The Crypt', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [{ ...base, id: LURKER, name: 'Crypt Lurker', position: { x: 1, y: 1 }, visible: true, controlledBy: null, hp: hp(9, 9), showHpBar: true }],
    },
  })).id;
  server = await createWsTestServer();
  [dmCookie, p1Cookie, specCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(p1Id), server.loginAs(specId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, p1Id, specId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { clearState(campaignId); });

/** Add the four combatants as the DM, waiting for each broadcast. */
async function addAll(dm: ReturnType<WsTestServer['connectAndAuth']> extends Promise<infer C> ? C : never) {
  for (const tokenId of [HERO, GOBLIN, SHOWN, HIDDEN]) {
    const done = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId, mapId });
    await done;
  }
}

const byId = (state: State, id: string) => state.combatants.find((c) => c.tokenId === id);

describe('initiative.state as each member may see it', () => {
  it('sends a player a creature\'s hit points only when its bar is on, and their own always', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    await addAll(dm);

    const asked = waitForEvent<State>(p1, 'initiative.state');
    p1.emit('initiative.request_state');
    const seen = await asked;
    expect(byId(seen, HERO)?.hp).toEqual(hp(4, 10));
    expect(byId(seen, GOBLIN)?.hp).toBeNull();
    expect(byId(seen, SHOWN)?.hp).toEqual(hp(5, 9));
    dm.disconnect();
    p1.disconnect();
  });

  // A spectator goes through the same non-DM branch as a player: nothing
  // hidden, no hit points behind a bar that is off, and, controlling nothing,
  // not even the hit points of a token that still names a player.
  it('sends a spectator the order as a player with no token would see it', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const spectator = await server.connectAndAuth(specCookie, campaignId);
    await addAll(dm);

    const asked = waitForEvent<State>(spectator, 'initiative.state');
    spectator.emit('initiative.request_state');
    const seen = await asked;
    expect(seen.combatants.map((c) => c.tokenId).sort()).toEqual([GOBLIN, HERO, SHOWN]);
    expect(byId(seen, HERO)?.hp).toBeNull();
    expect(byId(seen, GOBLIN)?.hp).toBeNull();
    expect(byId(seen, SHOWN)?.hp).toEqual(hp(5, 9));
    dm.disconnect();
    spectator.disconnect();
  });

  it('never lists a hidden token to a player, and lists everything to the DM', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    // The last add is the hidden token: the broadcast it causes is what the
    // player receives here.
    const lastForPlayer = new Promise<State>((resolve) => {
      let count = 0;
      p1.on('initiative.state', (s: State) => { count += 1; if (count === 4) resolve(s); });
    });
    await addAll(dm);
    const seen = await lastForPlayer;
    expect(seen.combatants.map((c) => c.tokenId).sort()).toEqual([GOBLIN, HERO, SHOWN]);

    const dmAsked = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.request_state');
    const dmSees = await dmAsked;
    expect(dmSees.combatants.map((c) => c.tokenId).sort()).toEqual([GOBLIN, HERO, HIDDEN, SHOWN]);
    expect(byId(dmSees, GOBLIN)?.hp).toEqual(hp(7, 7));
    expect(byId(dmSees, HIDDEN)?.hp).toEqual(hp(6, 6));
    dm.disconnect();
    p1.disconnect();
  });

  it('follows the token: hit points the DM changes reach the tracker on its next send', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    await addAll(dm);
    const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
    const tokens = readTokens(row.tokens).map((t) => (t.id === SHOWN ? { ...t, hp: hp(1, 9) } : t));
    await prisma.map.update({ where: { id: mapId }, data: { tokens: toJson(tokens) } });

    const asked = waitForEvent<State>(p1, 'initiative.state');
    p1.emit('initiative.request_state');
    expect(byId(await asked, SHOWN)?.hp).toEqual(hp(1, 9));
    dm.disconnect();
    p1.disconnect();
  });
});

describe('an obscured combatant', () => {
  it('reaches a player nameless, and its initiative roll does not name it either', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const added = waitForEvent<State>(p1, 'initiative.state');
    dm.emit('initiative.add', { tokenId: VEILED, mapId });
    const seen = byId(await added, VEILED);
    expect(seen).toBeDefined();
    expect(seen?.name).toBe('');
    expect(seen?.hp).toBeNull();
    // Nor is it marked as somebody's character: the tracker draws a player icon for that.
    expect(seen?.type).toBe('npc');

    const rolled = waitForEvent<{ characterName: string; purpose: string }>(p1, 'dice.rolled');
    dm.emit('initiative.roll', { tokenId: VEILED, mapId, characterName: 'Something Large' });
    const roll = await rolled;
    expect(roll.characterName).not.toContain('Something Large');
    expect(roll.purpose).not.toContain('Something Large');
    expect(roll.purpose).toMatch(/Initiative/);
    dm.disconnect();
    p1.disconnect();
  });
});

/**
 * The dice log entry an initiative roll makes goes only to those who are sent
 * the token: the tracker keeps a hidden or off-plane combatant from a player,
 * and the roll announcing it must not undo that.
 */
describe("an initiative roll's dice log entry", () => {
  interface Rolled { characterName: string; purpose: string; result: number }

  it.each([
    ['a hidden token', HIDDEN, 'Ambusher'],
    ['a token on the spirit plane', SPIRIT, 'Wisp'],
  ])('for %s reaches the DM by name and a player not at all', async (_what, tokenId, name) => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const added = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId, mapId });
    await added;

    const toDm = waitForEvent<Rolled>(dm, 'dice.rolled');
    const silence = expectNoEvent(p1, 'dice.rolled', 800);
    dm.emit('initiative.roll', { tokenId, mapId });
    const roll = await toDm;
    expect(roll.characterName).toBe(name);
    expect(roll.purpose).toBe(`${name} Initiative`);
    await expect(silence).resolves.toBeUndefined();

    dm.disconnect();
    p1.disconnect();
  });

  it('for a visible token reaches the player, named by the server and not by the client', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const added = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: GOBLIN, mapId });
    await added;

    const toP1 = waitForEvent<Rolled>(p1, 'dice.rolled');
    dm.emit('initiative.roll', { tokenId: GOBLIN, mapId, characterName: 'Definitely a Friend' });
    const roll = await toP1;
    expect(roll.characterName).toBe('Goblin');
    expect(roll.purpose).toBe('Goblin Initiative');

    dm.disconnect();
    p1.disconnect();
  });
});

// A combatant follows its token, so the DM can add one standing on a map the
// table is not showing, or move one there mid-fight. A player is not sent that
// map at all, so the order must not name what stands on it, nor its roll.
describe('a combatant on a map the campaign is not showing', () => {
  it('is listed to the DM and not to a player', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const added = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: LURKER, mapId: cryptId });
    expect(byId(await added, LURKER)?.name).toBe('Crypt Lurker');

    const toP1 = waitForEvent<State>(p1, 'initiative.state');
    p1.emit('initiative.request_state');
    expect(byId(await toP1, LURKER)).toBeUndefined();

    dm.disconnect();
    p1.disconnect();
  });

  it("has its initiative roll reach the DM and not a player", async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const p1 = await server.connectAndAuth(p1Cookie, campaignId);
    const added = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId: LURKER, mapId: cryptId });
    await added;

    const toDm = waitForEvent<{ characterName: string }>(dm, 'dice.rolled');
    const silence = expectNoEvent(p1, 'dice.rolled', 800);
    dm.emit('initiative.roll', { tokenId: LURKER, mapId: cryptId });
    expect((await toDm).characterName).toBe('Crypt Lurker');
    await expect(silence).resolves.toBeUndefined();

    dm.disconnect();
    p1.disconnect();
  });
});
