/**
 * Hit points and hit dice changed over the socket cannot put back an older
 * sheet.
 *
 * Both handlers read the whole sheet, changed one number, and wrote the whole
 * sheet back. A save that landed between the read and the write was undone:
 * the handler wrote the sheet as it was before the save. Here a save holds the
 * character's row while the socket change arrives, which is exactly that gap.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let characterId: string;
let dmCookie: string;

type Sheet = {
  hp: { current: number; maximum: number; temporary: number };
  hitDice: Array<{ class: string; die: string; maximum: number; remaining: number }>;
  notes?: string;
};
const sheet = (): Sheet => ({
  hp: { current: 10, maximum: 12, temporary: 0 },
  hitDice: [{ class: 'fighter', die: 'd10', maximum: 3, remaining: 3 }],
});
const stored = async (): Promise<Sheet> =>
  (await prisma.character.findUniqueOrThrow({ where: { id: characterId } })).data as unknown as Sheet;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A sheet save that holds the character's row until released: it has written
 * `notes`, and has not committed.
 */
async function saveHeldOpen(): Promise<{ release: () => Promise<void> }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  let written!: () => void;
  const hasWritten = new Promise<void>((resolve) => { written = resolve; });

  const save = prisma.$transaction(async (tx) => {
    await tx.character.update({
      where: { id: characterId },
      data: { data: toJson({ ...sheet(), notes: 'written by the save' }) },
    });
    written();
    await released;
  }, { timeout: 15000 });

  await hasWritten;
  return {
    release: async () => {
      release();
      await save;
    },
  };
}

beforeAll(async () => {
  const [dm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({
        data: { email: `race-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Race ${name}` },
      })
    )
  );
  dmId = dm.id;
  playerId = player.id;
  const campaign = await prisma.campaign.create({ data: { name: `Race ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  const character = await prisma.character.create({
    data: { userId: playerId, campaignId, name: 'Aldra', gameSystem: 'DND_5E', data: toJson(sheet()) },
  });
  characterId = character.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [characterId] },
    ],
  });
  server = await createWsTestServer();
  dmCookie = await server.loginAs(dmId);
});

beforeEach(async () => {
  await prisma.character.update({ where: { id: characterId }, data: { data: toJson(sheet()) } });
});

afterAll(async () => {
  await server?.close();
  await prisma.character.deleteMany({ where: { id: characterId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId] } } });
  await prisma.$disconnect();
});

describe('a socket change arriving while a save is being written', () => {
  it('applies a hit point change on top of the save', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const save = await saveHeldOpen();

    const updated = waitForEvent<{ hp: { current: number } }>(dm, 'character.hp.updated');
    dm.emit('character.hp.update', { characterId, delta: -4 });
    await sleep(500);
    await save.release();

    expect((await updated).hp.current).toBe(6);
    const after = await stored();
    expect(after.notes).toBe('written by the save');
    expect(after.hp.current).toBe(6);
    dm.disconnect();
  });

  it('spends a hit die on top of the save', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const save = await saveHeldOpen();

    const updated = waitForEvent(dm, 'character.updated');
    dm.emit('character.hitdice.spend', { characterId, index: 0 });
    await sleep(500);
    await save.release();

    await updated;
    const after = await stored();
    expect(after.notes).toBe('written by the save');
    expect(after.hitDice[0].remaining).toBe(2);
    dm.disconnect();
  });
});
