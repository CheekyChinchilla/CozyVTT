/**
 * A token's character sheet is read only when the character belongs to the
 * campaign the roll is made in.
 *
 * A token could be bound to any character id at all, and `initiative.roll`
 * then read that sheet and derived the roll from it: the expression went to
 * the dice log, and for Call of Cthulhu the Dexterity value itself was placed
 * in the order. Character ids are visible to every member of any shared
 * campaign, and anyone can be the DM of a campaign they create.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { getBlankTemplate } from '../../utils/character-templates';
import { GameSystem } from '../../game-systems';
import { toJson } from '../../utils/prisma-json';
import { clearState } from '../initiativeState';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `init-foreign-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let victimId: string;
let campaignId: string;
let otherCampaignId: string;
let mapId: string;
let dmCookie: string;

const FOREIGN = 'foreign-bound';
const OWN = 'own-bound';

type Rolled = { expression: string; characterName: string };
type State = { combatants: { tokenId: string }[] };

/** A 5e sheet whose Dexterity gives a +2 initiative modifier. */
function dexterousSheet(): Record<string, unknown> {
  const data = JSON.parse(JSON.stringify(getBlankTemplate(GameSystem.DND_5E).data)) as {
    stats: { dexterity: { score: number; modifier: number } };
  };
  data.stats.dexterity = { score: 14, modifier: 2 };
  return data;
}

beforeAll(async () => {
  const [dm, victim] = await Promise.all(
    ['dm', 'victim'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Init ${name}` } })
    )
  );
  dmId = dm.id;
  victimId = victim.id;

  const [campaign, other] = await Promise.all([
    prisma.campaign.create({ data: { name: `Init foreign ${runId}`, ownerId: dmId, vibeSettings: {} } }),
    prisma.campaign.create({ data: { name: `Init elsewhere ${runId}`, ownerId: victimId, vibeSettings: {} } }),
  ]);
  campaignId = campaign.id;
  otherCampaignId = other.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: victimId, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
    ],
  });

  // The same sheet in both campaigns: only the one in this campaign may be read.
  const [foreign, own] = await Promise.all([
    prisma.character.create({ data: { userId: victimId, campaignId: otherCampaignId, gameSystem: 'DND_5E', name: 'Elsewhere', data: toJson(dexterousSheet()) } }),
    prisma.character.create({ data: { userId: dmId, campaignId, gameSystem: 'DND_5E', name: 'Here', data: toJson(dexterousSheet()) } }),
  ]);

  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true, controlledBy: null };
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Init Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [
        { ...base, id: FOREIGN, name: 'Foreign-bound', position: { x: 1, y: 1 }, characterId: foreign.id },
        { ...base, id: OWN, name: 'Own-bound', position: { x: 2, y: 2 }, characterId: own.id },
      ],
    },
  });
  mapId = map.id;

  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

afterAll(async () => {
  await server?.close();
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.character.deleteMany({ where: { userId: { in: [dmId, victimId] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, victimId] } } });
  await prisma.$disconnect();
});

beforeEach(() => { clearState(campaignId); });

async function rollFor(tokenId: string): Promise<Rolled> {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const added = waitForEvent<State>(dm, 'initiative.state');
  dm.emit('initiative.add', { tokenId, mapId });
  await added;
  const rolled = waitForEvent<Rolled>(dm, 'dice.rolled');
  dm.emit('initiative.roll', { tokenId, mapId });
  const roll = await rolled;
  dm.disconnect();
  return roll;
}

describe('initiative.roll and the character a token names', () => {
  it('reads the sheet of a character in this campaign', async () => {
    expect((await rollFor(OWN)).expression).toBe('1d20+2');
  });

  it('ignores a character from another campaign and rolls the plain default', async () => {
    expect((await rollFor(FOREIGN)).expression).toBe('1d20');
  });
});
