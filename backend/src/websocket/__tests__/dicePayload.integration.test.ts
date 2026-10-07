/**
 * What a dice roll may carry besides its expression.
 *
 * Only the expression was bounded. The character name and the purpose went
 * into the roll's row and out to every member as sent, bounded only by the
 * socket's one-megabyte message size, so a player could store most of a
 * megabyte per roll and push it to every screen at the table, then again to
 * everyone who opened the dice log. `secret` was read as truthy or not, so
 * any value counted.
 *
 * The purpose is allowed a little more than a name: the sheets build it from
 * one, as "<attack name> Damage (Versatile)", and a name can be 200
 * characters long.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let mapId: string;
let dmCookie: string;
let playerCookie: string;

const rolls = () => prisma.diceRoll.count({ where: { campaignId } });

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: `dicepayload-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Dice ${name}` } })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Dice payload ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const map = await prisma.map.create({
    data: {
      campaignId, name: 'Dice Map', imageUrl: '/api/assets/maps/none', baseLayerUrl: '/api/assets/maps/none',
      width: 10, height: 10, gridSize: 50, annotations: [],
      tokens: [{ id: 'goblin', name: 'Goblin', imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {} }],
    },
  });
  mapId = map.id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  server = await createWsTestServer();
  [dmCookie, playerCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(playerId)]);
});

beforeEach(async () => {
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await server?.close();
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('dice.roll', () => {
  it.each([
    ['a 900 KB purpose', { purpose: 'A'.repeat(900_000) }, /Purpose/],
    ['a purpose over 300 characters', { purpose: 'A'.repeat(301) }, /Purpose/],
    ['a character name over 200 characters', { characterName: 'B'.repeat(201) }, /Character name/],
    ['a secret flag that is not true or false', { secret: 'yes' }, /secret/i],
    ['an expression that is not text', { expression: 20 }, /expression/i],
  ])('refuses %s, and stores and sends nothing', async (_what, changes, reason) => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');
    player.emit('dice.roll', { expression: '1d20', ...changes });

    expect((await refused).message).toMatch(reason);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await rolls()).toBe(0);
    player.disconnect();
  });

  it('takes a long purpose built from a 200-character attack name, and a 200-character name', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const rolled = waitForEvent<{ purpose: string; characterName: string }>(player, 'dice.rolled');
    const purpose = `${'C'.repeat(200)} Damage (Versatile)`;
    player.emit('dice.roll', { expression: '1d8+3', purpose, characterName: 'D'.repeat(200), secret: false });

    const roll = await rolled;
    expect(roll.purpose).toBe(purpose);
    expect(roll.characterName).toBe('D'.repeat(200));
    expect(await rolls()).toBe(1);
    player.disconnect();
  });

  it('still treats a missing name, purpose and flag as none', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const rolled = waitForEvent<{ purpose: string | null; characterName: string | null; secret: boolean }>(player, 'dice.rolled');
    player.emit('dice.roll', { expression: '1d20' });

    expect(await rolled).toMatchObject({ purpose: null, characterName: null, secret: false });
    player.disconnect();
  });
});

describe('initiative.roll', () => {
  it('refuses an expression that is not text, before reading anything', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const reads = jest.spyOn(prisma.map, 'findUnique');
    const refused = waitForEvent<{ message: string }>(dm, 'error');
    dm.emit('initiative.roll', { tokenId: 'goblin', mapId, expression: { dice: 20 } });

    expect((await refused).message).toMatch(/expression/i);
    expect(reads).not.toHaveBeenCalled();
    reads.mockRestore();
    dm.disconnect();
  });
});
