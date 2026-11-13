/**
 * The migration that gives the stored game systems and the GM's role
 * CozyVTT's own names.
 *
 * A database is built in a schema of its own as 1.6.0 left it, by every
 * migration before this one in order, and given rows holding every old value:
 * each game system and the unreleased one, the GM's role, message type and
 * drawing audience, and the game system a stat block names inside its JSON in
 * a creature, a token template, a map's tokens and a saved session's tokens.
 * The migration must rename each, give the unreleased system's rows no
 * system, drop that value, keep every row and every other field, run again
 * without changing anything, and leave nothing changed when it fails.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { prisma as appPrisma } from '../../config/database';
import { RETIRED_GAME_SYSTEM } from '../../__tests__/helpers/retiredGameSystem';
import { resolveStatBlockInitiative } from '../../utils/rules/initiative';
import { LEGACY_GAME_SYSTEMS, LEGACY_GM } from '../gameSystemAliases';

jest.setTimeout(120_000);

const MIGRATIONS = path.resolve(__dirname, '../../../prisma/migrations');
const ALL = fs.readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const MIGRATION = ALL.find((name) => name.endsWith('_name_systems_and_gm_role')) ?? '';
const SCHEMA = 'stored_names_migration_test';

const sqlOf = (name: string) => fs.readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');

let client: Client;

/** Runs SQL with unqualified names inside the test's schema. */
async function inSchema(sql: string): Promise<void> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    await client.query(sql);
  } finally {
    await client.query('RESET search_path');
  }
}

async function rows<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.query('RESET search_path');
  }
}

/** The labels an enum type holds, in order. */
async function labels(typeName: string): Promise<string[]> {
  const found = await rows<{ enumlabel: string }>(
    `SELECT enumlabel FROM pg_enum WHERE enumtypid = to_regtype('"${typeName}"') ORDER BY enumsortorder`
  );
  return found.map((row) => row.enumlabel);
}

const TABLES = [
  'User', 'Campaign', 'CampaignMembership', 'Character', 'CharacterTemplate', 'CreatureTemplate',
  'TokenTemplate', 'Map', 'MapDrawing', 'Session', 'Message',
];

/** Every row of every table the test fills, as JSON, so a run can be compared with the last. */
async function everything(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) out[table] = (await rows(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`)).map((r) => r.row);
  return out;
}

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of TABLES) out[table] = Number((await rows<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`))[0].n);
  return out;
}

const SRD_BEAST = { ac: 13, hp: 11, speed: '40 ft.', abilities: { str: 16, dex: 14, con: 12, int: 2, wis: 12, cha: 6 } };

/** A token list holding entries no version wrote, and one old label among them. */
const oddTokens = (label: string) => [null, 5, 'x', [1], { statBlock: null }, { statBlock: { gameSystem: 5 } }, { statBlock: { gameSystem: label } }];
/** A `tokens` that is not a list, though it holds an old label. */
const NOT_A_LIST = { statBlock: { gameSystem: 'DND_5E' } };

/** The rows a 1.6.0 database could hold, written with its values. */
async function fill(): Promise<void> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    await fillRows((sql, values = []) => client.query(sql, values));
  } finally {
    await client.query('RESET search_path');
  }
}

async function fillRows(q: (sql: string, values?: unknown[]) => Promise<unknown>): Promise<void> {
  await q(`INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt") VALUES ('u1', 'u1@test.invalid', 'x', 'Tester', NOW()), ('u2', 'u2@test.invalid', 'x', 'Player', NOW()), ('u3', 'u3@test.invalid', 'x', 'Watcher', NOW())`);

  const systems: Array<[string, string | null]> = [
    ['fifth', 'DND_5E'], ['fantasy', 'PATHFINDER_2E'], ['horror', 'CALL_OF_CTHULHU_7E'], ['retired', RETIRED_GAME_SYSTEM], ['none', null],
  ];
  for (const [key, system] of systems) {
    await q(`INSERT INTO "Campaign" (id, name, "ownerId", "vibeSettings", "gameSystem", "updatedAt") VALUES ($1, $1, 'u1', '{}', $2, NOW())`, [`campaign-${key}`, system]);
    await q(`INSERT INTO "Character" (id, "userId", name, data, "gameSystem", "updatedAt") VALUES ($1, 'u1', $1, $3, $2, NOW())`, [`character-${key}`, system, JSON.stringify({ name: key, kept: [1, 2, 3] })]);
    await q(`INSERT INTO "CharacterTemplate" (id, name, data, "gameSystem", "updatedAt") VALUES ($1, $1, '{}', $2, NOW())`, [`template-${key}`, system]);
    await q(`INSERT INTO "CreatureTemplate" (id, name, "statBlock", "gameSystem", "updatedAt") VALUES ($1, $1, $3, $2, NOW())`, [`creature-${key}`, system, JSON.stringify(SRD_BEAST)]);
  }
  // Seeded SRD creatures, and copies of them, name their system inside the stat block too.
  await q(`INSERT INTO "CreatureTemplate" (id, name, "statBlock", "gameSystem", "updatedAt") VALUES
    ('creature-srd', 'Wolf', $1, 'DND_5E', NOW()),
    ('creature-horror-label', 'Ghoul', $2, 'CALL_OF_CTHULHU_7E', NOW()),
    ('creature-fantasy-label', 'Goblin', $3, 'PATHFINDER_2E', NOW()),
    ('creature-other-label', 'Odd', $4, NULL, NOW()),
    ('creature-not-object', 'Listed', '[1, 2]', NULL, NOW())`,
  [
    JSON.stringify({ ...SRD_BEAST, gameSystem: 'DND_5E' }),
    JSON.stringify({ ...SRD_BEAST, gameSystem: 'CALL_OF_CTHULHU_7E' }),
    JSON.stringify({ ...SRD_BEAST, gameSystem: 'PATHFINDER_2E' }),
    JSON.stringify({ ...SRD_BEAST, gameSystem: 'SOMETHING_ELSE' }),
  ]);

  await q(`INSERT INTO "CampaignMembership" (id, "userId", "campaignId", role) VALUES
    ('m1', 'u1', 'campaign-fifth', 'DM'), ('m2', 'u2', 'campaign-fifth', 'PLAYER'), ('m3', 'u3', 'campaign-fifth', 'SPECTATOR')`);
  await q(`INSERT INTO "Message" (id, "campaignId", "userId", type, content) VALUES
    ('msg-gm', 'campaign-fifth', 'u1', 'DM', 'From the GM'), ('msg-player', 'campaign-fifth', 'u2', 'PLAYER', 'From a player')`);

  await q(`INSERT INTO "TokenTemplate" (id, name, "campaignId", "statBlock", "updatedAt") VALUES
    ('token-template-srd', 'Wolf', 'campaign-fifth', $1, NOW()),
    ('token-template-none', 'Plain', 'campaign-fifth', NULL, NOW())`,
  [JSON.stringify({ ...SRD_BEAST, gameSystem: 'DND_5E' })]);

  const tokens = [
    { id: 't1', name: 'Wolf', x: 1, y: 2, statBlock: { ...SRD_BEAST, gameSystem: 'DND_5E' } },
    { id: 't2', name: 'Hero', x: 3, y: 4, characterId: 'character-fifth' },
    { id: 't3', name: 'Ghoul', x: 5, y: 6, statBlock: { ...SRD_BEAST, gameSystem: 'CALL_OF_CTHULHU_7E' } },
    { id: 't4', name: 'Unlabelled', x: 7, y: 8, statBlock: SRD_BEAST },
  ];
  await q(`INSERT INTO "Map" (id, "campaignId", name, "imageUrl", width, height, "baseLayerUrl", tokens, annotations, "updatedAt") VALUES
    ('map-1', 'campaign-fifth', 'Forest', '/a.png', 20, 20, '/a.png', $1, '[]', NOW()),
    ('map-empty', 'campaign-fifth', 'Empty', '/b.png', 20, 20, '/b.png', '[]', '[]', NOW()),
    ('map-odd', 'campaign-fifth', 'Odd', '/c.png', 20, 20, '/c.png', $2, '[]', NOW()),
    ('map-not-a-list', 'campaign-fifth', 'Not a list', '/d.png', 20, 20, '/d.png', $3, '[]', NOW())`,
  [JSON.stringify(tokens), JSON.stringify(oddTokens('DND_5E')), JSON.stringify(NOT_A_LIST)]);
  await q(`INSERT INTO "MapDrawing" (id, "mapId", kind, color, width, points, audience) VALUES
    ('drawing-gm', 'map-1', 'pen', '#000000', 2, '[]', 'DM'), ('drawing-all', 'map-1', 'pen', '#000000', 2, '[]', 'ALL')`);
  await q(`INSERT INTO "Session" (id, "campaignId", "sessionNumber", "savedState") VALUES
    ('session-saved', 'campaign-fifth', 1, $1),
    ('session-bare', 'campaign-fifth', 2, NULL),
    ('session-no-tokens', 'campaign-fifth', 3, '{"mapId": "map-1"}'),
    ('session-odd', 'campaign-fifth', 4, $2),
    ('session-tokens-not-a-list', 'campaign-fifth', 5, $3),
    ('session-not-an-object', 'campaign-fifth', 6, $4)`,
  [
    JSON.stringify({ mapId: 'map-1', tokens, savedAt: '2026-11-01T00:00:00.000Z' }),
    JSON.stringify({ mapId: 'map-1', tokens: oddTokens('CALL_OF_CTHULHU_7E') }),
    JSON.stringify({ mapId: 'map-1', tokens: NOT_A_LIST }),
    JSON.stringify([{ statBlock: { gameSystem: 'DND_5E' } }]),
  ]);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('This test needs DATABASE_URL');
  if (!MIGRATION) throw new Error('No migration names the systems and the GM role');
  client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  // The database as 1.6.0 left it.
  for (const name of ALL.slice(0, ALL.indexOf(MIGRATION))) await inSchema(sqlOf(name));
  await fill();
});

afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
  await appPrisma.$disconnect();
});

describe('the database before the migration', () => {
  it('holds the old values, the unreleased system among them', async () => {
    expect(await labels('GameSystem')).toEqual(expect.arrayContaining([...Object.keys(LEGACY_GAME_SYSTEMS), RETIRED_GAME_SYSTEM]));
    expect(await labels('GameSystem')).toHaveLength(4);
    for (const type of ['CampaignRole', 'MessageType', 'DrawingAudience']) expect(await labels(type)).toContain(LEGACY_GM);
  });
});

describe('a migration that fails part-way', () => {
  it('leaves every value as it was', async () => {
    const before = await everything();
    await expect(inSchema(`${sqlOf(MIGRATION)}\nSELECT 1 / 0;`)).rejects.toThrow(/division by zero/);
    expect(await labels('GameSystem')).toHaveLength(4);
    expect(await labels('CampaignRole')).toEqual(['DM', 'PLAYER', 'SPECTATOR']);
    expect(await everything()).toEqual(before);
  });
});

describe('the migration', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    before = await counts();
    await inSchema(sqlOf(MIGRATION));
  });

  it('leaves the enums holding only the new values, in their order', async () => {
    expect(await labels('GameSystem')).toEqual(['FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100']);
    expect(await labels('CampaignRole')).toEqual(['GM', 'PLAYER', 'SPECTATOR']);
    expect(await labels('MessageType')).toEqual(['PLAYER', 'GM', 'SYSTEM', 'DICE_ROLL', 'CHARACTER_ACTION', 'WHISPER']);
    expect(await labels('DrawingAudience')).toEqual(['ALL', 'GM']);
  });

  it('renames the alias table\'s old values as the alias table does', async () => {
    const renamed = await rows<{ id: string; gameSystem: string | null }>(`SELECT id, "gameSystem" FROM "Campaign" ORDER BY id`);
    expect(Object.fromEntries(renamed.map((row) => [row.id, row.gameSystem]))).toEqual({
      'campaign-fantasy': LEGACY_GAME_SYSTEMS.PATHFINDER_2E,
      'campaign-fifth': LEGACY_GAME_SYSTEMS.DND_5E,
      'campaign-horror': LEGACY_GAME_SYSTEMS.CALL_OF_CTHULHU_7E,
      'campaign-none': null,
      'campaign-retired': null,
    });
  });

  it.each(['Character', 'CharacterTemplate'])('gives each %s its new system, and the unreleased one\'s none', async (table) => {
    const prefix = table === 'Character' ? 'character' : 'template';
    const renamed = await rows<{ id: string; gameSystem: string | null }>(`SELECT id, "gameSystem" FROM "${table}" ORDER BY id`);
    expect(Object.fromEntries(renamed.map((row) => [row.id, row.gameSystem]))).toEqual({
      [`${prefix}-fantasy`]: 'FANTASY_D20',
      [`${prefix}-fifth`]: 'FIFTH_EDITION',
      [`${prefix}-horror`]: 'HORROR_D100',
      [`${prefix}-none`]: null,
      [`${prefix}-retired`]: null,
    });
  });

  it('keeps a character\'s sheet as it was', async () => {
    const [row] = await rows<{ data: unknown }>(`SELECT data FROM "Character" WHERE id = 'character-retired'`);
    expect(row.data).toEqual({ name: 'retired', kept: [1, 2, 3] });
  });

  it('gives each creature its new system, and renames the system its stat block names', async () => {
    const renamed = await rows<{ id: string; gameSystem: string | null; statBlock: unknown }>(`SELECT id, "gameSystem", "statBlock" FROM "CreatureTemplate" ORDER BY id`);
    const byId = Object.fromEntries(renamed.map((row) => [row.id, row]));
    expect(byId['creature-fifth'].gameSystem).toBe('FIFTH_EDITION');
    expect(byId['creature-retired'].gameSystem).toBeNull();
    expect(byId['creature-srd']).toEqual({ id: 'creature-srd', gameSystem: 'FIFTH_EDITION', statBlock: { ...SRD_BEAST, gameSystem: 'FIFTH_EDITION' } });
    expect(byId['creature-horror-label'].statBlock).toEqual({ ...SRD_BEAST, gameSystem: 'HORROR_D100' });
    expect(byId['creature-fantasy-label'].statBlock).toEqual({ ...SRD_BEAST, gameSystem: 'FANTASY_D20' });
    // A label no version wrote, a stat block naming none, and one that is not an object stay as they were.
    expect(byId['creature-other-label'].statBlock).toEqual({ ...SRD_BEAST, gameSystem: 'SOMETHING_ELSE' });
    expect(byId['creature-fifth'].statBlock).toEqual(SRD_BEAST);
    expect(byId['creature-not-object'].statBlock).toEqual([1, 2]);
  });

  it('renames the system a token template\'s stat block names', async () => {
    const renamed = await rows<{ id: string; statBlock: unknown }>(`SELECT id, "statBlock" FROM "TokenTemplate" ORDER BY id`);
    expect(renamed).toEqual([
      { id: 'token-template-none', statBlock: null },
      { id: 'token-template-srd', statBlock: { ...SRD_BEAST, gameSystem: 'FIFTH_EDITION' } },
    ]);
  });

  const renamedTokens = [
    { id: 't1', name: 'Wolf', x: 1, y: 2, statBlock: { ...SRD_BEAST, gameSystem: 'FIFTH_EDITION' } },
    { id: 't2', name: 'Hero', x: 3, y: 4, characterId: 'character-fifth' },
    { id: 't3', name: 'Ghoul', x: 5, y: 6, statBlock: { ...SRD_BEAST, gameSystem: 'HORROR_D100' } },
    { id: 't4', name: 'Unlabelled', x: 7, y: 8, statBlock: SRD_BEAST },
  ];

  // Entries no version wrote, a statBlock of null or with a label that is
  // not text, a tokens that is not a list and a snapshot that is not an
  // object are kept as they are; only an old label in a token's stat block
  // is renamed.
  it('renames the system each token on a map names, keeping every token in its place', async () => {
    const maps = await rows<{ id: string; tokens: unknown }>(`SELECT id, tokens FROM "Map" ORDER BY id`);
    expect(maps).toEqual([
      { id: 'map-1', tokens: renamedTokens },
      { id: 'map-empty', tokens: [] },
      { id: 'map-not-a-list', tokens: NOT_A_LIST },
      { id: 'map-odd', tokens: oddTokens('FIFTH_EDITION') },
    ]);
  });

  it('renames the system each token in a saved session names, and keeps the rest of the snapshot', async () => {
    const sessions = await rows<{ id: string; savedState: unknown }>(`SELECT id, "savedState" FROM "Session" ORDER BY id`);
    expect(sessions).toEqual([
      { id: 'session-bare', savedState: null },
      { id: 'session-no-tokens', savedState: { mapId: 'map-1' } },
      { id: 'session-not-an-object', savedState: [{ statBlock: { gameSystem: 'DND_5E' } }] },
      { id: 'session-odd', savedState: { mapId: 'map-1', tokens: oddTokens('HORROR_D100') } },
      { id: 'session-saved', savedState: { mapId: 'map-1', tokens: renamedTokens, savedAt: '2026-11-01T00:00:00.000Z' } },
      { id: 'session-tokens-not-a-list', savedState: { mapId: 'map-1', tokens: NOT_A_LIST } },
    ]);
  });

  it('makes the GM\'s membership, message and drawing GM, and leaves the rest', async () => {
    expect(await rows(`SELECT id, role::text FROM "CampaignMembership" ORDER BY id`)).toEqual([
      { id: 'm1', role: 'GM' }, { id: 'm2', role: 'PLAYER' }, { id: 'm3', role: 'SPECTATOR' },
    ]);
    expect(await rows(`SELECT id, type::text FROM "Message" ORDER BY id`)).toEqual([{ id: 'msg-gm', type: 'GM' }, { id: 'msg-player', type: 'PLAYER' }]);
    expect(await rows(`SELECT id, audience::text FROM "MapDrawing" ORDER BY id`)).toEqual([{ id: 'drawing-all', audience: 'ALL' }, { id: 'drawing-gm', audience: 'GM' }]);
  });

  it('keeps every row', async () => {
    expect(await counts()).toEqual(before);
  });

  it('keeps the drawing audience\'s default', async () => {
    const [column] = await rows<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns WHERE table_schema = '${SCHEMA}' AND table_name = 'MapDrawing' AND column_name = 'audience'`
    );
    expect(column.column_default).toMatch(/^'ALL'::/);
  });

  it('leaves no value of the unreleased system able to be stored', async () => {
    await expect(inSchema(`UPDATE "Campaign" SET "gameSystem" = '${RETIRED_GAME_SYSTEM}' WHERE id = 'campaign-none'`)).rejects.toThrow(/invalid input value for enum/);
  });

  // An SRD creature's DEX decides its initiative at a 5E table only while its
  // stat block names the campaign's system as the campaign does.
  it.each([
    ['a creature', `SELECT "statBlock" AS block FROM "CreatureTemplate" WHERE id = 'creature-srd'`],
    ['a token template', `SELECT "statBlock" AS block FROM "TokenTemplate" WHERE id = 'token-template-srd'`],
    ['a token on a map', `SELECT tokens -> 0 -> 'statBlock' AS block FROM "Map" WHERE id = 'map-1'`],
  ])('leaves %s placed from an SRD creature rolling initiative with its DEX modifier in a 5E campaign', async (_what, sql) => {
    const [{ block }] = await rows<{ block: unknown }>(sql);
    expect(resolveStatBlockInitiative('FIFTH_EDITION', block)).toEqual({ kind: 'roll', expression: '1d20+2', label: '1d20+2' });
  });

  it('changes nothing when it runs again', async () => {
    const after = await everything();
    await inSchema(sqlOf(MIGRATION));
    expect(await everything()).toEqual(after);
    expect(await labels('GameSystem')).toEqual(['FIFTH_EDITION', 'FANTASY_D20', 'HORROR_D100']);
  });
});

describe('the migration\'s file', () => {
  const sql = sqlOf(MIGRATION);

  it('renames each game system as the alias table does', () => {
    for (const [old, now] of Object.entries(LEGACY_GAME_SYSTEMS)) {
      expect(sql).toContain(`('GameSystem', '${old}', '${now}')`);
    }
    for (const names of sql.matchAll(/'(\{"[^']+\})'::jsonb AS names/g)) expect(JSON.parse(names[1])).toEqual(LEGACY_GAME_SYSTEMS);
    expect([...sql.matchAll(/'(\{"[^']+\})'::jsonb AS names/g)]).toHaveLength(4);
  });

  it('renames the GM\'s value in each of its enums', () => {
    for (const type of ['CampaignRole', 'MessageType', 'DrawingAudience']) expect(sql).toContain(`('${type}', '${LEGACY_GM}', 'GM')`);
  });

  it('deletes no row and drops nothing but the old GameSystem type', () => {
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bCASCADE\b/i);
    expect(sql.match(/\bDROP\b.*$/gim)).toEqual(['DROP TYPE "GameSystem";']);
  });

  it('holds no transaction statement of its own, so it runs as one', () => {
    // A DO block's BEGIN opens its body, not a transaction.
    expect(sql).not.toMatch(/^\s*(BEGIN\s*(TRANSACTION|WORK)?\s*;|COMMIT\b|ROLLBACK\b|START\s+TRANSACTION\b|END\s*;)/im);
  });
});
