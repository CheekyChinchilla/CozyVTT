/**
 * A spectator cannot change a character, not even one they own.
 *
 * `character.hp.update` and `character.hitdice.spend` asked only "owner or
 * DM", so a member demoted to spectator could still change the hit points of
 * a character they had brought while a player, and a token bound to it
 * followed on every screen: its bar, its downed fade, whether it holds its
 * square. Spectators are watching; the DM can still cover for them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `spec-char-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let spectatorId: string;
let campaignId: string;
let characterId: string;
let dmCookie: string;
let spectatorCookie: string;

type Sheet = { hp: { current: number; maximum: number; temporary: number }; hitDice: Array<{ remaining: number }> };
const sheet = () => ({ hp: { current: 10, maximum: 12, temporary: 0 }, hitDice: [{ class: 'fighter', die: 'd10', maximum: 3, remaining: 3 }] });
const stored = async (): Promise<Sheet> =>
  (await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).data as unknown as Sheet;

beforeAll(async () => {
  const [dm, spectator] = await Promise.all(
    ['dm', 'spectator'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Spec ${name}` } })
    )
  );
  dmId = dm.id;
  spectatorId = spectator.id;
  const campaign = await prisma.campaign.create({ data: { name: `Spec ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  const character = await prisma.character.create({
    data: { userId: spectatorId, campaignId, name: 'Aldra', gameSystem: 'DND_5E', data: toJson(sheet()) },
  });
  characterId = character.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: spectatorId, campaignId, role: 'SPECTATOR', characterIds: [characterId] },
    ],
  });
  server = await createWsTestServer();
  [dmCookie, spectatorCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(spectatorId)]);
});

beforeEach(async () => {
  await prisma.character.update({ where: { id: characterId }, data: { data: toJson(sheet()) } });
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { id: characterId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, spectatorId] } } });
  await prisma.$disconnect();
});

describe('a spectator and the character they own', () => {
  it('may not change its hit points, and nobody is told anything', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const spectator = await server.connectAndAuth(spectatorCookie, campaignId);

    const denial = waitForEvent<{ message: string }>(spectator, 'error');
    const silence = expectNoEvent(dm, 'character.hp.updated');
    spectator.emit('character.hp.update', { characterId, delta: -5 });
    expect((await denial).message).toMatch(/spectator/i);
    await silence;
    expect((await stored()).hp.current).toBe(10);

    dm.disconnect();
    spectator.disconnect();
  });

  it('may not spend its hit dice', async () => {
    const spectator = await server.connectAndAuth(spectatorCookie, campaignId);

    const denial = waitForEvent<{ message: string }>(spectator, 'error');
    spectator.emit('character.hitdice.spend', { characterId, index: 0 });
    expect((await denial).message).toMatch(/spectator/i);
    expect((await stored()).hitDice[0].remaining).toBe(3);

    spectator.disconnect();
  });

  it('is still the DM\'s to change', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);

    const updated = waitForEvent<{ hp: { current: number } }>(dm, 'character.hp.updated');
    dm.emit('character.hp.update', { characterId, delta: -5 });
    expect((await updated).hp.current).toBe(5);

    dm.disconnect();
  });
});
