/**
 * The migrate:sheet-fields script against a real database.
 *
 * It is run on a live instance, so a player can save, or a GM change hit
 * points, between the moment it reads a sheet and the moment it writes the
 * migrated copy back. Written from the first read, that copy put the old
 * values back over the change.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient, type Prisma } from '@prisma/client';
import { prisma, createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { migrateSheetFields } from '../migrate-sheet-fields';
import { convertHorrorD100Sheet, isOldHorrorD100Sheet } from '../../legacy/horrorD100Sheet';

let userId: string;

beforeAll(async () => {
  userId = (await createTestUser({ displayName: 'Sheet fields' })).id;
});

afterAll(async () => {
  await cleanupUsers([userId]);
  await prisma.$disconnect();
});

type Sheet = Record<string, unknown>;

async function character(gameSystem: 'FIFTH_EDITION' | 'FANTASY_D20' | 'HORROR_D100', data: Sheet) {
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
    const { id } = await character('FIFTH_EDITION', legacy);

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
    const fifthEdition = await character('FIFTH_EDITION', {
      personality: { traits: 'Mine.' },
      personalityTraits: 'From the template.',
    });
    const fantasyD20 = await character('FANTASY_D20', {
      strikes: [{ name: 'Longsword', type: 'melee' }],
      attacks: [{ name: 'Warhammer', range: 'melee' }, { name: 'Crossbow', range: 'ranged' }],
    });

    const report = await migrateSheetFields(prisma, { dryRun: false, where: mine });

    expect((await stored(fifthEdition.id)).personality).toEqual({ traits: 'Mine.\n\nFrom the template.' });
    expect((await stored(fantasyD20.id)).strikes).toEqual([
      { name: 'Longsword', type: 'melee' },
      { name: 'Warhammer', type: 'melee' },
      { name: 'Crossbow', type: 'ranged' },
    ]);
    expect(report.changed.map((c) => c.id).sort()).toEqual([fifthEdition.id, fantasyD20.id].sort());
    expect(report.changed.find((c) => c.id === fantasyD20.id)?.notes).toContain('moved 2 attack(s) to strikes');
  });

  it('keeps and lists an older field it cannot move', async () => {
    const horrorD100 = await character('HORROR_D100', { playerName: 'Current', player: 'Old' });

    const report = await migrateSheetFields(prisma, { dryRun: false, where: mine });

    expect(await stored(horrorD100.id)).toEqual({ playerName: 'Current', player: 'Old' });
    expect(report.kept.map((k) => k.id)).toEqual([horrorD100.id]);
    expect(report.kept[0].notes.join(' ')).toMatch(/kept 'player'/);
  });

  // The server converts these sheets itself before it listens; the script,
  // run on an instance that has not restarted, moves them the same way.
  it('converts a Horror d100 sheet in the shape before 1.7.0 to the rebuilt sheet, listing what it kept', async () => {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../legacy/__fixtures__/horror-d100-sheets/malformed.json'), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('malformed.json holds no sheet');
    const old: Sheet = { ...parsed };
    const horrorD100 = await character('HORROR_D100', old);

    const report = await migrateSheetFields(prisma, { dryRun: false, where: mine });

    const sheet = await stored(horrorD100.id);
    expect(isOldHorrorD100Sheet(sheet)).toBe(false);
    expect(sheet.converted).toMatchObject({ from: 1 });
    const change = report.changed.find((c) => c.id === horrorD100.id);
    expect(change?.notes[0]).toBe('converted to the rebuilt Horror d100 sheet');
    expect(change?.notes.slice(1)).toEqual(convertHorrorD100Sheet(old, new Date()).kept.map((item) => `kept ${item}`));

    expect((await migrateSheetFields(prisma, { dryRun: false, where: mine })).changed).toEqual([]);
  });

  it('changes nothing in a dry run', async () => {
    const legacy = { personalityTraits: 'Brave.' };
    const { id } = await character('FIFTH_EDITION', legacy);

    const report = await migrateSheetFields(prisma, { dryRun: true, where: mine });

    expect(report.changed).toHaveLength(1);
    expect(await stored(id)).toEqual(legacy);
  });
});
