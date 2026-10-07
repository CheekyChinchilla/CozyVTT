/**
 * The migrate:sheet-fields script against a real database.
 *
 * It is run on a live instance, so a player can save, or a DM change hit
 * points, between the moment it reads a sheet and the moment it writes the
 * migrated copy back. Written from the first read, that copy put the old
 * values back over the change.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { migrateSheetFields } from '../migrate-sheet-fields';

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Sheet fields' })).id;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

type Sheet = Record<string, unknown>;

async function character(gameSystem: 'DND_5E' | 'PATHFINDER_2E' | 'CALL_OF_CTHULHU_7E', data: Sheet) {
  return prisma.character.create({
    data: { userId, name: `Legacy ${gameSystem}`, gameSystem, data: data as Prisma.InputJsonValue },
  });
}

const stored = async (id: string) => (await prisma.character.findUniqueOrThrow({ where: { id } })).data as Sheet;
const mine = { userId: '' };

beforeEach(async () => {
  await prisma.character.deleteMany({ where: { userId } });
  mine.userId = userId;
});

/**
 * A client whose first transaction is preceded by someone else's write, the
 * way a player's save lands while the script is part-way through.
 */
function withSaveDuringRun(client: PrismaClient, save: () => Promise<unknown>): PrismaClient {
  let saved = false;
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property);
      if (property === '$transaction' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          if (!saved) {
            saved = true;
            await save();
          }
          return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        };
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

describe('migrate:sheet-fields', () => {
  it('keeps a save that lands between its read and its write', async () => {
    const legacy = { characterName: 'Aldra', hp: { maximum: 12, current: 12, temporary: 0 }, personalityTraits: 'Brave.' };
    const { id } = await character('DND_5E', legacy);

    const racing = withSaveDuringRun(prisma, () =>
      prisma.character.update({ where: { id }, data: { data: { ...legacy, hp: { maximum: 12, current: 3, temporary: 0 } } } })
    );
    await migrateSheetFields(racing, { dryRun: false, where: mine });

    const after = await stored(id);
    expect(after.hp).toEqual({ maximum: 12, current: 3, temporary: 0 });
    expect(after.personality).toEqual({ traits: 'Brave.' });
    expect(after).not.toHaveProperty('personalityTraits');
  });

  it('adds what only the older field holds, for each system', async () => {
    const dnd = await character('DND_5E', {
      personality: { traits: 'Mine.' },
      personalityTraits: 'From the template.',
    });
    const pf2e = await character('PATHFINDER_2E', {
      strikes: [{ name: 'Longsword', type: 'melee' }],
      attacks: [{ name: 'Warhammer', range: 'melee' }, { name: 'Crossbow', range: 'ranged' }],
    });

    const report = await migrateSheetFields(prisma, { dryRun: false, where: mine });

    expect((await stored(dnd.id)).personality).toEqual({ traits: 'Mine.\n\nFrom the template.' });
    expect((await stored(pf2e.id)).strikes).toEqual([
      { name: 'Longsword', type: 'melee' },
      { name: 'Warhammer', type: 'melee' },
      { name: 'Crossbow', type: 'ranged' },
    ]);
    expect(report.changed.map((c) => c.id).sort()).toEqual([dnd.id, pf2e.id].sort());
    expect(report.changed.find((c) => c.id === pf2e.id)?.notes).toContain('moved 2 attack(s) to strikes');
  });

  it('keeps and lists an older field it cannot move', async () => {
    const coc = await character('CALL_OF_CTHULHU_7E', { playerName: 'Current', player: 'Old' });

    const report = await migrateSheetFields(prisma, { dryRun: false, where: mine });

    expect(await stored(coc.id)).toEqual({ playerName: 'Current', player: 'Old' });
    expect(report.kept.map((k) => k.id)).toEqual([coc.id]);
    expect(report.kept[0].notes.join(' ')).toMatch(/kept 'player'/);
  });

  it('changes nothing in a dry run', async () => {
    const legacy = { personalityTraits: 'Brave.' };
    const { id } = await character('DND_5E', legacy);

    const report = await migrateSheetFields(prisma, { dryRun: true, where: mine });

    expect(report.changed).toHaveLength(1);
    expect(await stored(id)).toEqual(legacy);
  });
});
