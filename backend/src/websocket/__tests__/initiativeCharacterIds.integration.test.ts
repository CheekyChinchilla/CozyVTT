/**
 * Each combatant in the initiative order carries the id of its token's
 * character, so the tracker can open that sheet whatever map the token is on.
 *
 * The tracker's menu found a combatant's character through the token on the
 * map on screen, and a combatant on another map had no menu: one on a map
 * the DM is preparing, or one on the table's map while the DM prepares
 * another. The order now names each combatant's character to each member
 * only where the map already does: every one to the DM, and to a player or a
 * spectator only on a combatant whose token the map sends them, so never on
 * one that is hidden, on the other plane, on a map the table is not on, out
 * of their sight on a lit map, or obscured unless they control it. The order
 * still lists a combatant out of their sight, as it did. A creature has none.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { clearState } from '../initiativeState';
import { readTokens, toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `init-chars-${name}-${runId}@test.cozyvtt.local`;

type Entry = { tokenId: string; mapId: string; name: string; characterId?: string | null };
type State = { combatants: Entry[] };
type Client = Awaited<ReturnType<WsTestServer['connectAndAuth']>>;

let server: WsTestServer;
let dmId: string;
let p1Id: string;
let p2Id: string;
let specId: string;
let campaignId: string;
let mapId: string;
let cryptId: string;
let litCampaignId: string;
const cookies: Record<'dm' | 'p1' | 'p2' | 'spec', string> = { dm: '', p1: '', p2: '', spec: '' };
/** Each character by the token bound to it. */
const characterOf: Record<string, string> = {};

/** On the table's map: */
const HERO = 'hero';        // the first player's character, theirs to move
const FRIEND = 'friend';    // the second player's character, theirs to move
const GOBLIN = 'goblin';    // a creature, bound to no character
const HIDDEN = 'hidden';    // a character the DM keeps hidden
const VEILED = 'veiled';    // a character shown obscured, the second player's to move
const SPIRIT = 'spirit';    // a character on the spirit plane
/** On a map the DM is preparing: */
const LURKER = 'lurker';    // a character waiting there

const ON_TABLE = [HERO, FRIEND, GOBLIN, HIDDEN, VEILED, SPIRIT];

beforeAll(async () => {
  const [dm, p1, p2, spec] = await Promise.all(
    ['dm', 'p1', 'p2', 'spec'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Init ${name}` } })
    )
  );
  dmId = dm.id; p1Id = p1.id; p2Id = p2.id; specId = spec.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Init chars ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: p1Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: p2Id, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: specId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  const owners: Record<string, string> = { [HERO]: p1Id, [FRIEND]: p2Id, [HIDDEN]: dmId, [VEILED]: p2Id, [SPIRIT]: dmId, [LURKER]: dmId };
  for (const [tokenId, userId] of Object.entries(owners)) {
    characterOf[tokenId] = (await prisma.character.create({ data: { userId, campaignId, name: `Character of ${tokenId}`, data: {} } })).id;
  }
  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true, controlledBy: null };
  const token = (id: string, x: number, fields: Record<string, unknown> = {}) => ({
    ...base, id, name: id, position: { x, y: 1 }, characterId: characterOf[id] ?? null, ...fields,
  });
  mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Table', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [
        token(HERO, 1, { controlledBy: p1Id, type: 'player' }),
        token(FRIEND, 2, { controlledBy: p2Id, type: 'player' }),
        token(GOBLIN, 3),
        token(HIDDEN, 4, { visible: false }),
        token(VEILED, 5, { controlledBy: p2Id, obscured: true }),
        token(SPIRIT, 6, { layer: 'spirit' }),
      ],
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  cryptId = (await prisma.map.create({
    data: {
      campaignId, name: 'The Crypt', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [], tokens: [token(LURKER, 1)],
    },
  })).id;
  server = await createWsTestServer();
  [cookies.dm, cookies.p1, cookies.p2, cookies.spec] = await Promise.all([dmId, p1Id, p2Id, specId].map((id) => server.loginAs(id)));
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId: { in: [campaignId, litCampaignId] } } });
  await prisma.character.deleteMany({ where: { campaignId: { in: [campaignId, litCampaignId] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, litCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, p1Id, p2Id, specId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { clearState(campaignId); });

/** Put every combatant in the order as the DM, the prepared map's included. */
async function addAll(dm: Client): Promise<void> {
  for (const [tokenId, onMap] of [...ON_TABLE.map((id) => [id, mapId]), [LURKER, cryptId]]) {
    const done = waitForEvent<State>(dm, 'initiative.state');
    dm.emit('initiative.add', { tokenId, mapId: onMap });
    await done;
  }
}

/** The order as `client` is sent it, each combatant's character by token. */
async function charactersSeenBy(client: Client): Promise<Record<string, string | null | undefined>> {
  const asked = waitForEvent<State>(client, 'initiative.state');
  client.emit('initiative.request_state');
  const state = await asked;
  return Object.fromEntries(state.combatants.map((c) => [c.tokenId, c.characterId]));
}

describe("each combatant's character in initiative.state", () => {
  it('is named to the DM for every combatant, on any map, hidden, obscured or on the spirit plane', async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    try {
      await addAll(dm);
      expect(await charactersSeenBy(dm)).toEqual({
        [HERO]: characterOf[HERO],
        [FRIEND]: characterOf[FRIEND],
        [GOBLIN]: null,
        [HIDDEN]: characterOf[HIDDEN],
        [VEILED]: characterOf[VEILED],
        [SPIRIT]: characterOf[SPIRIT],
        [LURKER]: characterOf[LURKER],
      });
    } finally {
      dm.disconnect();
    }
  });

  it("is named to a player for their own character and another player's, as the map names them, and for nothing they are not sent", async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    try {
      await addAll(dm);
      // The hidden one, the one on the spirit plane and the one on the
      // prepared map are not listed to them at all; the obscured one is,
      // as a shape with no identity.
      expect(await charactersSeenBy(p1)).toEqual({
        [HERO]: characterOf[HERO],
        [FRIEND]: characterOf[FRIEND],
        [GOBLIN]: null,
        [VEILED]: null,
      });
    } finally {
      dm.disconnect();
      p1.disconnect();
    }
  });

  it('is named to the player who moves an obscured combatant, who may know what it is', async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    const p2 = await server.connectAndAuth(cookies.p2, campaignId);
    try {
      await addAll(dm);
      expect((await charactersSeenBy(p2))[VEILED]).toBe(characterOf[VEILED]);
    } finally {
      dm.disconnect();
      p2.disconnect();
    }
  });

  it('is named to a spectator as to a player who moves nothing', async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    const spectator = await server.connectAndAuth(cookies.spec, campaignId);
    try {
      await addAll(dm);
      expect(await charactersSeenBy(spectator)).toEqual({
        [HERO]: characterOf[HERO],
        [FRIEND]: characterOf[FRIEND],
        [GOBLIN]: null,
        [VEILED]: null,
      });
    } finally {
      dm.disconnect();
      spectator.disconnect();
    }
  });

  it('follows the token: a character the DM unbinds is no longer named, to the DM or to a player', async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    const p1 = await server.connectAndAuth(cookies.p1, campaignId);
    try {
      await addAll(dm);
      const row = await prisma.map.findUniqueOrThrow({ where: { id: mapId }, select: { tokens: true } });
      await prisma.map.update({
        where: { id: mapId },
        data: { tokens: toJson(readTokens(row.tokens).map((t) => (t.id === FRIEND ? { ...t, characterId: null } : t))) },
      });
      expect((await charactersSeenBy(dm))[FRIEND]).toBeNull();
      expect((await charactersSeenBy(p1))[FRIEND]).toBeNull();
    } finally {
      dm.disconnect();
      p1.disconnect();
    }
  });

  it("is kept on the DM's entry for a combatant whose token is gone, as the rest of that entry is", async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    try {
      await addAll(dm);
      const row = await prisma.map.findUniqueOrThrow({ where: { id: cryptId }, select: { tokens: true } });
      await prisma.map.update({ where: { id: cryptId }, data: { tokens: toJson(readTokens(row.tokens).filter((t) => t.id !== LURKER)) } });
      expect((await charactersSeenBy(dm))[LURKER]).toBe(characterOf[LURKER]);
    } finally {
      dm.disconnect();
    }
  });
});

// On a lit map the map sends a player only the tokens in their sight, and a
// spectator, who sees from no token, none. The order lists every combatant
// still, as before, but names a character only where the map sends its token.
describe('on a lit map', () => {
  const SEER = 'seer';  // the first player's character, theirs to move
  const NEAR = 'near';  // a character on their side of the wall
  const FAR = 'far';    // a character beyond it
  const litCharacter: Record<string, string> = {};

  beforeAll(async () => {
    litCampaignId = (await prisma.campaign.create({ data: { name: `Init chars lit ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId: litCampaignId, role: 'DM', characterIds: [] },
        { userId: p1Id, campaignId: litCampaignId, role: 'PLAYER', characterIds: [] },
        { userId: specId, campaignId: litCampaignId, role: 'SPECTATOR', characterIds: [] },
      ],
    });
    for (const [tokenId, userId] of [[SEER, p1Id], [NEAR, dmId], [FAR, dmId]]) {
      litCharacter[tokenId] = (await prisma.character.create({ data: { userId, campaignId: litCampaignId, name: `Lit ${tokenId}`, data: {} } })).id;
    }
    const token = (id: string, x: number, controlledBy: string | null) => ({
      id, name: id, imageUrl: '', position: { x, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', rotation: 0,
      conditions: [], metadata: {}, visible: true, controlledBy, characterId: litCharacter[id], type: 'player',
    });
    // Everything in line of sight is lit; a wall from top to bottom, 250
    // pixels in, stands between the player's token and the far one.
    const litMapId = (await prisma.map.create({
      data: {
        campaignId: litCampaignId, name: 'Dark Hall', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
        width: 10, height: 10, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination: true,
        wallSegments: [{ id: randomUUID(), x1: 250, y1: 0, x2: 250, y2: 500, type: 'wall' }],
        tokens: [token(SEER, 1, p1Id), token(NEAR, 2, null), token(FAR, 8, null)],
      },
    })).id;
    await prisma.campaign.update({ where: { id: litCampaignId }, data: { currentMapId: litMapId } });
    const dm = await server.connectAndAuth(cookies.dm, litCampaignId);
    try {
      for (const tokenId of [SEER, NEAR, FAR]) {
        const done = waitForEvent<State>(dm, 'initiative.state');
        dm.emit('initiative.add', { tokenId, mapId: litMapId });
        await done;
      }
    } finally {
      dm.disconnect();
    }
  });

  async function seenOnLitMap(who: 'dm' | 'p1' | 'spec') {
    const client = await server.connectAndAuth(cookies[who], litCampaignId);
    try {
      return await charactersSeenBy(client);
    } finally {
      client.disconnect();
    }
  }

  it('names to a player the characters in their sight, and lists the one beyond the wall without its character', async () => {
    expect(await seenOnLitMap('p1')).toEqual({ [SEER]: litCharacter[SEER], [NEAR]: litCharacter[NEAR], [FAR]: null });
  });

  it('names no character to a spectator, who is sent no token there', async () => {
    expect(await seenOnLitMap('spec')).toEqual({ [SEER]: null, [NEAR]: null, [FAR]: null });
  });

  it('names every character to the DM', async () => {
    expect(await seenOnLitMap('dm')).toEqual({ [SEER]: litCharacter[SEER], [NEAR]: litCharacter[NEAR], [FAR]: litCharacter[FAR] });
  });
});
