/**
 * The conversion of every stored Horror d100 sheet, as the server runs it
 * before it listens.
 *
 * A schema of this file's own holds characters and character templates of
 * every kind a database can: old Horror d100 sheets from each version, one
 * malformed, rebuilt ones, Flexible sheets carrying the old sheet's keys,
 * and other systems' sheets. The conversion must convert every old Horror
 * d100 sheet and only those, bump each one's `updatedAt`, list what each
 * kept, leave a sheet that fails as it was and go on, change nothing when it
 * runs again, leave every sheet either as it was or fully converted when it
 * is stopped between two, convert each sheet once when two runs start
 * together, and never stop the server from starting. It must find the old
 * sheets without loading any sheet, however many and however large the
 * rebuilt ones are.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';
import { HorrorD100SheetSchema } from '../../validators/game-systems/horrorD100Sheet.schema';
import { toJson } from '../../utils/prisma-json';
import logger from '../../utils/logger';
import * as converter from '../horrorD100Sheet';
import {
  STORED_SHEETS_LOCK, convertStoredHorrorD100Sheets, convertStoredHorrorD100SheetsAtStart, oldSheetIds, oldSheetIdsQuery,
} from '../storedHorrorD100Sheets';
import { Client } from 'pg';
import { createPrismaClient, databaseConnectionSettings } from '../../config/prismaClient';

jest.setTimeout(120_000);

type Fields = Record<string, unknown>;

const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');
const OLD_FIXTURES = ['v1.3.0-detective', 'v1.5.0-blank', 'v1.6.0-detective-played', 'v1.6.0-example', 'v1.6.0-example-minimal', 'pre-1.3.0-player', 'malformed'];

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fixture(name: string): Fields {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
  if (!isFields(parsed)) throw new Error(`${name}.json does not hold a sheet`);
  return parsed;
}

const FLEXIBLE = { investigatorName: 'Iris', occupation: 'Sailor', derivedStats: { luck: { score: 50 } }, characteristics: { APP: { regular: 60 } } };
const FIFTH_EDITION = { characterName: 'Aldra', occupation: 'kept as stored', level: 3 };

let schema: IsolatedSchema;
let db: PrismaClient;
let userId: string;

/** Every character and template, by id, with its sheet and when it last changed. */
async function everything(): Promise<Map<string, { data: unknown; updatedAt: Date }>> {
  const rows = [
    ...(await db.character.findMany({ select: { id: true, data: true, updatedAt: true } })),
    ...(await db.characterTemplate.findMany({ select: { id: true, data: true, updatedAt: true } })),
  ];
  return new Map(rows.map((row) => [row.id, { data: row.data, updatedAt: row.updatedAt }]));
}

/** Empties the schema's sheets and fills it again: every old fixture as a character and a template, and the sheets never to convert. */
async function fill(): Promise<{ old: string[]; untouched: string[] }> {
  await db.character.deleteMany();
  await db.characterTemplate.deleteMany();
  const old: string[] = [];
  for (const name of OLD_FIXTURES) {
    old.push((await db.character.create({ data: { id: `character-${name}`, userId, name, gameSystem: 'HORROR_D100', data: toJson(fixture(name)) } })).id);
    old.push((await db.characterTemplate.create({ data: { id: `template-${name}`, name, gameSystem: 'HORROR_D100', data: toJson(fixture(name)), createdById: userId } })).id);
  }
  const rebuilt = converter.convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date('2026-11-12T08:00:00.000Z')).sheet;
  const untouched = [
    (await db.character.create({ data: { id: 'character-rebuilt', userId, name: 'Rebuilt', gameSystem: 'HORROR_D100', data: toJson(rebuilt) } })).id,
    (await db.character.create({ data: { id: 'character-flexible', userId, name: 'Flexible', gameSystem: null, data: toJson(FLEXIBLE) } })).id,
    (await db.character.create({ data: { id: 'character-fifth', userId, name: 'Fifth', gameSystem: 'FIFTH_EDITION', data: toJson(FIFTH_EDITION) } })).id,
    (await db.character.create({ data: { id: 'character-not-a-sheet', userId, name: 'List', gameSystem: 'HORROR_D100', data: toJson([1, 2]) } })).id,
    (await db.characterTemplate.create({ data: { id: 'template-flexible', name: 'Flexible', gameSystem: null, data: toJson(FLEXIBLE), createdById: userId } })).id,
    (await db.characterTemplate.create({ data: { id: 'template-rebuilt', name: 'Rebuilt', gameSystem: 'HORROR_D100', data: toJson(rebuilt), createdById: userId } })).id,
  ];
  return { old, untouched };
}

/**
 * Whether a stored sheet is fully converted: no old key left, and its record
 * written, for a character and a template alike (sheetConversion.ts).
 */
function fullyConverted(data: unknown, _id = ''): boolean {
  const old: boolean = converter.isOldHorrorD100Sheet(data);
  if (old || !isFields(data) || Object.hasOwn(data, 'investigatorName')) return false;
  return isFields(data.converted);
}

const run = () => convertStoredHorrorD100Sheets(db, { databaseUrl: schema.url });

beforeAll(async () => {
  schema = createIsolatedSchema('horror_d100_conversion_test');
  db = createPrismaClient(schema.url);
  userId = (await db.user.create({ data: { email: 'conversion@test.invalid', passwordHash: 'x', displayName: 'Converter' } })).id;
});

afterAll(async () => {
  await db.$disconnect();
  schema.drop();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the conversion of the stored sheets', () => {
  it('converts every old Horror d100 sheet, characters and templates, and bumps when each changed', async () => {
    const { old, untouched } = await fill();
    const before = await everything();
    const result = await run();
    const after = await everything();

    expect(result.converted).toBe(old.length);
    expect(result.failed).toEqual([]);
    for (const id of old) {
      expect({ id, converted: fullyConverted(after.get(id)?.data, id) }).toEqual({ id, converted: true });
      expect(after.get(id)!.updatedAt.getTime()).toBeGreaterThan(before.get(id)!.updatedAt.getTime());
    }
    for (const id of untouched) expect({ id, ...after.get(id) }).toEqual({ id, ...before.get(id) });
  });

  it('gives a template the record its conversion writes, with what it could not place', async () => {
    await fill();
    await run();
    const after = await everything();
    for (const name of OLD_FIXTURES) {
      const character = after.get(`character-${name}`)?.data;
      const template = after.get(`template-${name}`)?.data;
      if (!isFields(character) || !isFields(template) || !isFields(character.converted) || !isFields(template.converted)) {
        throw new Error(`${name} has no record on its character or its template`);
      }
      const { at: _characterAt, ...characterRecord } = character.converted;
      const { at: _templateAt, ...templateRecord } = template.converted;
      expect({ name, record: templateRecord }).toEqual({ name, record: characterRecord });
    }
    const malformed = after.get('template-malformed')?.data;
    expect(isFields(malformed) && isFields(malformed.converted) && Array.isArray(malformed.converted.kept) ? malformed.converted.kept.length : 0).toBeGreaterThan(0);
  });

  it('converts each sheet to what the converter gives, every sheet an older version stored passing the schema', async () => {
    await fill();
    await run();
    const after = await everything();
    for (const name of OLD_FIXTURES.filter((n) => n !== 'malformed')) {
      const data = after.get(`character-${name}`)?.data;
      const parsed = HorrorD100SheetSchema.safeParse(data);
      expect({ name, issues: parsed.success ? [] : parsed.error.issues }).toEqual({ name, issues: [] });
    }
  });

  it('lists what each sheet kept, the malformed one\'s among them, in the result and the log', async () => {
    await fill();
    const warn = jest.spyOn(logger, 'warn');
    const result = await run();
    const malformed = result.kept.find((entry) => entry.id === 'character-malformed');
    const { kept: items, keptLabels: labels } = converter.convertHorrorD100Sheet(fixture('malformed'), new Date());
    expect(malformed?.items).toEqual(items);
    // The log names what was kept by label and count, never the values a player typed.
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('kept values'), { table: 'Character', id: 'character-malformed', keptCount: items.length, keptLabels: labels });
    const logged = JSON.stringify(warn.mock.calls);
    expect(items.filter((item) => logged.includes(item))).toEqual([]);
  });

  it('changes nothing when it runs a second time', async () => {
    await fill();
    await run();
    const before = await everything();
    expect(await run()).toEqual({ converted: 0, kept: [], failed: [] });
    expect(await everything()).toEqual(before);
  });

  it('leaves a sheet that fails as it was, logs it, and converts the rest', async () => {
    const { old } = await fill();
    const before = await everything();
    const real = converter.convertHorrorD100Sheet;
    jest.spyOn(converter, 'convertHorrorD100Sheet').mockImplementation((data, now) => {
      if (isFields(data) && data.investigatorName === 'Nell Ashby') throw new Error('this sheet breaks the conversion');
      return real(data, now);
    });
    const errorLog = jest.spyOn(logger, 'error');
    const result = await run();
    const after = await everything();

    const broken = old.filter((id) => isFields(before.get(id)?.data) && (before.get(id)!.data as Fields).investigatorName === 'Nell Ashby');
    expect(broken.length).toBeGreaterThan(0);
    expect(result.failed.map((entry) => entry.id).sort()).toEqual([...broken].sort());
    for (const id of broken) expect(after.get(id)).toEqual(before.get(id));
    for (const id of old.filter((id) => !broken.includes(id))) expect(fullyConverted(after.get(id)?.data, id)).toBe(true);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('could not be converted'), expect.objectContaining({ id: broken[0] }));
  });

  it('leaves every sheet either as it was or fully converted when it is stopped between two, and the next run converts the rest', async () => {
    const { old } = await fill();
    const before = await everything();
    let written = 0;
    await expect(convertStoredHorrorD100Sheets(db, {
      databaseUrl: schema.url,
      onConverted: () => {
        written += 1;
        if (written === 3) throw new Error('the backend stopped');
      },
    })).rejects.toThrow('the backend stopped');

    const stopped = await everything();
    const states = old.map((id) => (fullyConverted(stopped.get(id)?.data, id) ? 'converted' : JSON.stringify(stopped.get(id)) === JSON.stringify(before.get(id)) ? 'as it was' : 'half'));
    expect(states.filter((state) => state === 'half')).toEqual([]);
    expect(states.filter((state) => state === 'converted')).toHaveLength(3);

    expect((await run()).converted).toBe(old.length - 3);
    const after = await everything();
    for (const id of old) expect(fullyConverted(after.get(id)?.data, id)).toBe(true);
  });

  it('skips a sheet changed after the list was read: converted meanwhile, moved to another system, or deleted', async () => {
    const { old } = await fill();
    const elsewhere = converter.convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date('2026-11-12T08:00:00.000Z')).sheet;
    let changed = false;
    const result = await convertStoredHorrorD100Sheets(db, {
      databaseUrl: schema.url,
      onConverted: async () => {
        if (changed) return;
        changed = true;
        await db.character.update({ where: { id: 'character-v1.6.0-example' }, data: { data: toJson(elsewhere) } });
        await db.character.update({ where: { id: 'character-v1.5.0-blank' }, data: { gameSystem: null } });
        await db.character.delete({ where: { id: 'character-v1.3.0-detective' } });
      },
    });
    const after = await everything();

    expect(result.converted).toBe(old.length - 3);
    expect(result.failed).toEqual([]);
    expect(after.get('character-v1.6.0-example')?.data).toEqual(elsewhere);
    expect(after.get('character-v1.5.0-blank')?.data).toEqual(fixture('v1.5.0-blank'));
    expect(after.has('character-v1.3.0-detective')).toBe(false);
  });

  it('waits for a save holding a sheet\'s row, and converts the copy it saved', async () => {
    await fill();
    const saved = { ...fixture('v1.6.0-example'), investigatorName: 'Saved Meanwhile' };
    const saver = new Client(databaseConnectionSettings(schema.url).pool);
    await saver.connect();
    try {
      await saver.query('BEGIN');
      await saver.query(`UPDATE "Character" SET data = $1 WHERE id = 'character-v1.6.0-example'`, [JSON.stringify(saved)]);
      const running = run();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await saver.query('COMMIT');
      await running;
    } finally {
      await saver.end();
    }
    const after = await everything();
    expect((after.get('character-v1.6.0-example')?.data as Fields).characterName).toBe('Saved Meanwhile');
  });

  it('lets go of its lock when it stops part-way', async () => {
    await fill();
    await expect(convertStoredHorrorD100Sheets(db, { databaseUrl: schema.url, onConverted: () => { throw new Error('stopped'); } })).rejects.toThrow('stopped');
    const other = new Client(databaseConnectionSettings(schema.url).pool);
    await other.connect();
    try {
      const { rows } = await other.query<{ taken: boolean }>('SELECT pg_try_advisory_lock($1, $2) AS taken', [...STORED_SHEETS_LOCK]);
      expect(rows[0].taken).toBe(true);
      await other.query('SELECT pg_advisory_unlock($1, $2)', [...STORED_SHEETS_LOCK]);
    } finally {
      await other.end();
    }
  });

  it('converts without the lock, each sheet still locked on its own, when another session holds it past the wait', async () => {
    const { old } = await fill();
    const holder = new Client(databaseConnectionSettings(schema.url).pool);
    await holder.connect();
    const warn = jest.spyOn(logger, 'warn');
    try {
      await holder.query('SELECT pg_advisory_lock($1, $2)', [...STORED_SHEETS_LOCK]);
      const result = await convertStoredHorrorD100Sheets(db, { databaseUrl: schema.url, lockWaitMs: 300 });
      expect(result.converted).toBe(old.length);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('without it'), expect.anything());
    } finally {
      await holder.end();
    }
  });

  it('reads no sheet that already carries its conversion record', async () => {
    await fill();
    await run();
    const detector = jest.spyOn(converter, 'isOldHorrorD100Sheet');
    await run();
    const read = detector.mock.calls.map(([data]) => data);
    expect(read.filter((data) => isFields(data) && isFields(data.converted))).toEqual([]);
  });

  it('converts each sheet once when two runs start together', async () => {
    const { old } = await fill();
    const [first, second] = await Promise.all([run(), run()]);
    expect(first.converted + second.converted).toBe(old.length);
    expect([first.converted, second.converted]).toContain(0);
  });
});

describe('finding the sheets still to convert', () => {
  /** Stores each sheet as a Horror d100 character and a template, and answers which of them the listing names. */
  async function listed(sheets: unknown[]): Promise<{ characters: boolean[]; templates: boolean[] }> {
    await db.character.deleteMany();
    await db.characterTemplate.deleteMany();
    const id = (index: number) => `case-${String(index).padStart(4, '0')}`;
    await db.character.createMany({ data: sheets.map((data, index) => ({ id: id(index), userId, name: 'Case', gameSystem: 'HORROR_D100' as const, data: toJson(data) })) });
    await db.characterTemplate.createMany({ data: sheets.map((data, index) => ({ id: id(index), name: 'Case', gameSystem: 'HORROR_D100' as const, data: toJson(data), createdById: userId })) });
    const characters = new Set(await oldSheetIds(db, 'Character'));
    const templates = new Set(await oldSheetIds(db, 'CharacterTemplate'));
    return { characters: sheets.map((_, index) => characters.has(id(index))), templates: sheets.map((_, index) => templates.has(id(index))) };
  }

  it('asks the database for ids alone, never a sheet', async () => {
    for (const table of ['Character', 'CharacterTemplate'] as const) {
      const query = oldSheetIdsQuery(table, '');
      expect(query.sql).toMatch(new RegExp(`^\\s*SELECT id FROM "${table}"\\s`));
      expect(query.sql.match(/\bSELECT\b[^]*?\bFROM\b/gi)?.filter((select) => /\bdata\b/.test(select))).toEqual([]);
    }
    await fill();
    const rows = await db.$queryRaw<Array<Record<string, unknown>>>(oldSheetIdsQuery('Character', ''));
    expect(rows.length).toBe(OLD_FIXTURES.length);
    for (const row of rows) expect(Object.keys(row)).toEqual(['id']);
  });

  it('names exactly the sheets the detector calls old, for every key the detector goes by', async () => {
    const row = { baseValue: 5, currentValue: 40 };
    const old: unknown[] = [
      ...converter.OLD_ONLY_KEYS.map((key) => ({ [key]: 'kept' })),
      ...converter.OLD_ONLY_KEYS.map((key) => ({ [key]: null })),
      ...converter.OLD_DERIVED_KEYS.map((key) => ({ derivedStats: { [key]: 7 } })),
      { characteristics: { APP: 50 } },
      { characteristics: { STR: 12, POW: { regular: 60 } } },
      ...converter.OLD_ONLY_SKILLS.map((key) => ({ skills: { climb: 40, [key]: row } })),
      ...converter.OLD_ONLY_SKILLS.map((key) => ({ skills: { [key]: { first: 3, second: row } } })),
      { converted: 'yes', characteristics: { APP: 50 } },
      { converted: [1], [converter.OLD_ONLY_KEYS[0]]: 'kept' },
    ];
    const rebuilt = converter.convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date('2026-11-12T08:00:00.000Z')).sheet;
    const notOld: unknown[] = [
      rebuilt, {}, [], [converter.OLD_ONLY_KEYS[0]], 'sheet', converter.OLD_ONLY_KEYS[0], 42,
      { ...fixture('v1.6.0-example'), converted: { from: 1 } },
      { characterName: 'Ada', profession: 'Detective', era: 'Modern', characteristics: { STR: 12, EDU: 14 } },
      { derivedStats: [converter.OLD_DERIVED_KEYS[0]] }, { derivedStats: converter.OLD_DERIVED_KEYS[0] }, { derivedStats: { initiative: 8 } },
      { characteristics: [{ regular: 60 }] }, { characteristics: 'APP' }, { characteristics: ['APP'] }, { characteristics: { STR: ['regular'], CON: 'regular' } },
      { skills: { history: row, survival: row, occult: row, charm: row } },
      { skills: [{ [converter.OLD_ONLY_SKILLS[0]]: row }] }, { skills: converter.OLD_ONLY_SKILLS[0] },
      ...converter.OLD_ONLY_SKILLS.map((key) => ({ skills: { [key]: 40 } })),
      { skills: { [converter.OLD_ONLY_SKILLS[0]]: [row] } }, { skills: { [converter.OLD_ONLY_SKILLS[0]]: { first: [row], second: 'currentValue' } } },
      { skills: { [converter.OLD_ONLY_SKILLS[0]]: { rank: 6, linkedAttribute: 'agility' } } },
    ];
    // Each old fixture a key at a time, and a skill at a time, so a kind of evidence the detector gains is met here too.
    const pieces: unknown[] = [];
    for (const name of OLD_FIXTURES) {
      const sheet = fixture(name);
      pieces.push(sheet);
      for (const [key, value] of Object.entries(sheet)) pieces.push({ [key]: value });
      if (isFields(sheet.skills)) for (const [key, value] of Object.entries(sheet.skills)) pieces.push({ skills: { [key]: value } });
    }
    const sheets = [...old, ...notOld, ...pieces];
    const expected = sheets.map((sheet) => converter.isOldHorrorD100Sheet(sheet));
    expect(expected.slice(0, old.length)).toEqual(old.map(() => true));
    expect(expected.slice(old.length, old.length + notOld.length)).toEqual(notOld.map(() => false));

    const found = await listed(sheets);
    const disagreeing = (answers: boolean[]) => sheets.filter((_, index) => answers[index] !== expected[index]).map((sheet) => JSON.stringify(sheet).slice(0, 200));
    expect(disagreeing(found.characters)).toEqual([]);
    expect(disagreeing(found.templates)).toEqual([]);
  });

  it('loads none of 150 large sheets made on the rebuilt sheet, on any start, and still converts an old one among them', async () => {
    await db.character.deleteMany();
    await db.characterTemplate.deleteMany();
    const rebuilt = converter.convertHorrorD100Sheet(fixture('v1.6.0-example'), new Date('2026-11-12T08:00:00.000Z')).sheet;
    if (!isFields(rebuilt)) throw new Error('the converted example is not a sheet');
    // A sheet made on 1.7.0 has no conversion record.
    const { converted: _record, ...native } = rebuilt;
    const id = (index: number) => `character-large-${String(index).padStart(3, '0')}`;
    await db.character.createMany({
      data: Array.from({ length: 150 }, (_, index) => ({ id: id(index), userId, name: 'Large', gameSystem: 'HORROR_D100' as const, data: toJson({ ...native, characterName: 'Large' }) })),
    });
    // About 900 KB a sheet, in letters outside Latin-1, added where the sheets are stored.
    await db.$executeRaw`UPDATE "Character" SET data = data || jsonb_build_object('notes', repeat('я', 450000))`;
    await db.character.create({ data: { id: `${id(75)}-old`, userId, name: 'Old', gameSystem: 'HORROR_D100', data: toJson(fixture('v1.6.0-example')) } });
    const sizes = await db.$queryRaw<Array<{ bytes: number }>>`SELECT min(octet_length(data::text))::int AS bytes FROM "Character" WHERE id LIKE 'character-large-___'`;
    expect(sizes[0].bytes).toBeGreaterThan(900_000);

    const detector = jest.spyOn(converter, 'isOldHorrorD100Sheet');
    const loadedLarge = () => detector.mock.calls.filter(([data]) => isFields(data) && data.characterName === 'Large').length;
    const started = Date.now();
    const first = await run();
    expect(first).toEqual({ converted: 1, kept: [], failed: [] });
    expect(loadedLarge()).toBe(0);
    expect(detector).toHaveBeenCalledTimes(1);
    const stored = await db.character.findUnique({ where: { id: `${id(75)}-old` }, select: { data: true } });
    expect(fullyConverted(stored?.data)).toBe(true);

    // A later start: nothing is old, and no sheet is loaded at all.
    detector.mockClear();
    expect(await run()).toEqual({ converted: 0, kept: [], failed: [] });
    expect(detector).not.toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(30_000);
  });
});

describe('the conversion at start', () => {
  it('logs a run that cannot finish and lets the server start, leaving the sheets as they were', async () => {
    const { old } = await fill();
    const before = await everything();
    const errorLog = jest.spyOn(logger, 'error');
    const unreachable = new URL(schema.url);
    unreachable.port = '1';
    const elsewhere = createPrismaClient(unreachable.toString());
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = unreachable.toString();
    try {
      await expect(convertStoredHorrorD100SheetsAtStart(elsewhere)).resolves.toBeUndefined();
    } finally {
      process.env.DATABASE_URL = previous;
      await elsewhere.$disconnect();
    }
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('did not finish'), expect.anything());
    const after = await everything();
    for (const id of old) expect(after.get(id)).toEqual(before.get(id));
  });

  it('runs before the server listens', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
    const converted = source.indexOf('await convertStoredHorrorD100SheetsAtStart(prisma);');
    expect(converted).toBeGreaterThan(-1);
    expect(converted).toBeLessThan(source.indexOf('httpServer.listen('));
  });
});
