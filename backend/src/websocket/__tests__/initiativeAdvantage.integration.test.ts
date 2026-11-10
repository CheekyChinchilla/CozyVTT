/**
 * A D&D 5e character whose sheet has advantage on initiative rolls two d20s
 * and keeps the higher when the server rolls for its token.
 *
 * The server decides what initiative rolls, from the sheet of the character a
 * token is bound to, so the sheet's box has to reach the roll here and not
 * only the label the roll menu shows. Advantage and disadvantage together
 * cancel to one d20, so a level of exhaustion on the sheet cancels it.
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
const email = `init-advantage-dm-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;

const WITH_ADVANTAGE = 'with-advantage';
const WITHOUT_FIELD = 'without-field';
const EXHAUSTED = 'exhausted';

type Rolled = {
  expression: string;
  result: number;
  breakdown: { rolls: { type: string; results?: number[]; kept?: number[] }[] };
};

/** A 5e sheet whose Dexterity gives a +2 initiative modifier, with `extra` laid over it. */
function sheet(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const data = JSON.parse(JSON.stringify(getBlankTemplate(GameSystem.DND_5E).data)) as Record<string, unknown> & {
    stats: { dexterity: { score: number; modifier: number } };
  };
  data.stats.dexterity = { score: 14, modifier: 2 };
  // As a character saved before the box existed: no key at all.
  delete data.initiativeAdvantage;
  return { ...data, ...extra };
}

beforeAll(async () => {
  const dm = await prisma.user.create({
    data: { email, passwordHash: 'not-used-by-socket-auth', displayName: 'Init advantage DM' },
  });
  dmId = dm.id;
  const campaign = await prisma.campaign.create({
    data: { name: `Init advantage ${runId}`, ownerId: dmId, vibeSettings: {} },
  });
  campaignId = campaign.id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });

  const make = (name: string, data: Record<string, unknown>) =>
    prisma.character.create({ data: { userId: dmId, campaignId, gameSystem: 'DND_5E', name, data: toJson(data) } });
  const [quick, plain, tired] = await Promise.all([
    make('Wren Quickstep', sheet({ initiativeAdvantage: true })),
    make('Odo Plainfield', sheet()),
    make('Mags Weary', sheet({ initiativeAdvantage: true, exhaustionLevel: 1 })),
  ]);

  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', rotation: 0, conditions: [], metadata: {}, visible: true, controlledBy: null };
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Init Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [
        { ...base, id: WITH_ADVANTAGE, name: 'Wren', position: { x: 1, y: 1 }, characterId: quick.id },
        { ...base, id: WITHOUT_FIELD, name: 'Odo', position: { x: 2, y: 2 }, characterId: plain.id },
        { ...base, id: EXHAUSTED, name: 'Mags', position: { x: 3, y: 3 }, characterId: tired.id },
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
  await prisma.character.deleteMany({ where: { userId: dmId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: dmId } });
  await prisma.$disconnect();
});

beforeEach(() => { clearState(campaignId); });
afterEach(() => { jest.restoreAllMocks(); });

/**
 * Roll initiative for a token as the DM, with d20s that come up 5, 17, 5, 17
 * and so on. The server rolls an expression once to check it before the roll
 * that counts, so a pair of dice comes up 5 and 17 either way.
 */
async function rollFor(tokenId: string): Promise<Rolled> {
  const dm = await server.connectAndAuth(dmCookie, campaignId);
  const added = waitForEvent(dm, 'initiative.state');
  dm.emit('initiative.add', { tokenId, mapId });
  await added;
  const rolled = waitForEvent<Rolled>(dm, 'dice.rolled');
  const faces = [0.2, 0.8];
  let next = 0;
  jest.spyOn(Math, 'random').mockImplementation(() => faces[next++ % faces.length]);
  dm.emit('initiative.roll', { tokenId, mapId });
  const roll = await rolled;
  dm.disconnect();
  return roll;
}

function expectOneD20PlusTwo(roll: Rolled): void {
  expect(roll.expression).toBe('1d20+2');
  const faces = roll.breakdown.rolls[0].results ?? [];
  expect(faces).toHaveLength(1);
  expect(roll.result).toBe(faces[0] + 2);
}

describe('initiative.roll and advantage on initiative', () => {
  it('rolls two d20s and keeps the higher for a sheet with the box ticked', async () => {
    const roll = await rollFor(WITH_ADVANTAGE);
    expect(roll.expression).toBe('2d20kh1+2');
    expect(roll.breakdown.rolls[0]).toMatchObject({ type: 'dice', results: [5, 17], kept: [17] });
    expect(roll.result).toBe(19);
  });

  it('rolls one d20 for a sheet stored without the box, as before', async () => {
    expectOneD20PlusTwo(await rollFor(WITHOUT_FIELD));
  });

  it('rolls one d20 when a level of exhaustion cancels the advantage', async () => {
    expectOneD20PlusTwo(await rollFor(EXHAUSTED));
  });
});
