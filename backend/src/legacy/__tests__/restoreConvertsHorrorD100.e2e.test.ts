/**
 * An Admin Panel restore of a backup made by 1.5.0 comes out with every
 * Horror d100 sheet converted, before the restore answers and with no
 * restart.
 *
 * The database tools are stubbed as the restore route's own test stubs them,
 * but each does to a schema of this file's own what the real one does to the
 * database: psql's load replaces the schema with 1.5.0's (built by every
 * migration up to that release's last) holding the rows such a backup holds,
 * old Horror d100 sheets among them, and the migration run applies every
 * migration since. Nothing is copied from a real backup.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execFile: jest.fn(),
}));

import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Client } from 'pg';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { LEGACY_GAME_SYSTEMS } from '../gameSystemAliases';
import { isOldHorrorD100Sheet } from '../horrorD100Sheet';
import { HorrorD100SheetSchema } from '../../validators/game-systems/horrorD100Sheet.schema';
import { zipBuffer } from '../../__tests__/helpers/zipFixtures';

jest.setTimeout(180_000);

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-restore-horror-'));
process.env.BACKUP_DIR = path.join(SCRATCH, 'backups');
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

type Fields = Record<string, unknown>;

const SCHEMA = 'restore_horror_d100_test';
const MIGRATIONS = path.resolve(__dirname, '../../../prisma/migrations');
const ALL = fs.readdirSync(MIGRATIONS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
/** The last migration of 1.5.0: a backup that release made holds every migration up to it. */
const LAST_OF_1_5_0 = '20260928120000_keep_rolls_and_uploads_of_deleted_accounts';
const UP_TO_1_5_0 = ALL.slice(0, ALL.indexOf(LAST_OF_1_5_0) + 1);
const SINCE_1_5_0 = ALL.slice(ALL.indexOf(LAST_OF_1_5_0) + 1);
const MIGRATE = 'node_modules/.bin/prisma';
const FIXTURES = path.join(__dirname, '../__fixtures__/horror-d100-sheets');

const sharedUrl = process.env.DATABASE_URL ?? '';
const execFileMock = execFile as unknown as jest.Mock;
const oldHorrorValue = Object.keys(LEGACY_GAME_SYSTEMS).find((old) => LEGACY_GAME_SYSTEMS[old] === 'HORROR_D100');

let client: Client;
let app: ReturnType<typeof import('../../__tests__/helpers/test-app').createTestApp>;
let appDb: PrismaClient;
let admin: ReturnType<typeof request.agent>;

const sqlOf = (name: string) => fs.readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8');

/** Runs SQL with unqualified names inside the test's schema. */
async function inSchema(sql: string, values: unknown[] = []): Promise<void> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    await client.query(sql, values);
  } finally {
    await client.query('RESET search_path');
  }
}

async function rows<T extends Fields>(sql: string): Promise<T[]> {
  await client.query(`SET search_path TO "${SCHEMA}"`);
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.query('RESET search_path');
  }
}

/** The schema emptied and built by `migrations` in order. */
async function rebuild(migrations: string[]): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  for (const name of migrations) await inSchema(sqlOf(name));
}

const FLEXIBLE = JSON.stringify({ investigatorName: 'Iris', occupation: 'Sailor', derivedStats: { luck: { score: 50 } } });

/** What psql's load of a 1.5.0 backup leaves: that release's tables, with its values and its sheets. */
async function load150Backup(): Promise<void> {
  await rebuild(UP_TO_1_5_0);
  await inSchema(`INSERT INTO "User" (id, email, "passwordHash", "displayName", "updatedAt") VALUES ('u1', 'restored@test.invalid', 'x', 'Restored', NOW())`);
  await inSchema(`INSERT INTO "Campaign" (id, name, "ownerId", "vibeSettings", "gameSystem", "updatedAt") VALUES ('c1', 'Old table', 'u1', '{}', $1, NOW())`, [oldHorrorValue]);
  for (const name of ['v1.3.0-detective', 'v1.5.0-blank', 'pre-1.3.0-player', 'malformed']) {
    await inSchema(`INSERT INTO "Character" (id, "userId", name, data, "gameSystem", "updatedAt") VALUES ($1, 'u1', $1, $2, $3, NOW())`, [`character-${name}`, fixture(name), oldHorrorValue]);
    await inSchema(`INSERT INTO "CharacterTemplate" (id, name, data, "gameSystem", "updatedAt") VALUES ($1, $1, $2, $3, NOW())`, [`template-${name}`, fixture(name), oldHorrorValue]);
  }
  await inSchema(`INSERT INTO "Character" (id, "userId", name, data, "gameSystem", "updatedAt") VALUES ('character-flexible', 'u1', 'Flexible', $1, NULL, NOW())`, [FLEXIBLE]);
  await inSchema(`INSERT INTO "CharacterTemplate" (id, name, data, "gameSystem", "updatedAt") VALUES ('template-flexible', 'Flexible', $1, NULL, NOW())`, [FLEXIBLE]);
}

/**
 * A dump the restore takes as a whole pg_dump of a CozyVTT database, of the
 * schema this instance keeps its data in.
 */
const BACKUP_DUMP = [
  '--',
  '-- PostgreSQL database dump',
  '--',
  `CREATE TABLE ${SCHEMA}."User" (`,
  '    id text NOT NULL',
  ');',
  `CREATE TABLE ${SCHEMA}._prisma_migrations (`,
  '    id character varying(36) NOT NULL',
  ');',
  '',
  '--',
  '-- PostgreSQL database dump complete',
  '--',
  '',
].join('\n');

beforeAll(async () => {
  client = new Client({ connectionString: sharedUrl.replace(/[?&]connection_limit=\d+/, '') });
  await client.connect();
  // The instance as it is before the restore: this release's tables.
  await rebuild(ALL);
  const address = new URL(sharedUrl);
  address.searchParams.set('schema', SCHEMA);
  process.env.DATABASE_URL = address.toString();

  const { createTestApp } = require('../../__tests__/helpers/test-app') as typeof import('../../__tests__/helpers/test-app');
  const db = require('../../__tests__/helpers/db') as typeof import('../../__tests__/helpers/db');
  appDb = (require('../../config/database') as typeof import('../../config/database')).prisma;
  app = createTestApp();
  const adminUser = await db.createTestUser({ role: 'ADMIN' });
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: adminUser.email, password: db.TEST_PASSWORD })).status).toBe(200);
  await db.prisma.$disconnect();

  execFileMock.mockImplementation((cmd: string, args: string[], ...rest: unknown[]) => {
    const done = rest[rest.length - 1] as (err: Error | null, out?: { stdout: string; stderr: string }) => void;
    const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : undefined;
    const work = async () => {
      if (cmd === 'pg_dump' && file) fs.writeFileSync(file, '-- the database as it was before the restore\n');
      if (cmd === 'psql') await load150Backup();
      if (cmd === MIGRATE) for (const name of SINCE_1_5_0) await inSchema(sqlOf(name));
    };
    work().then(() => done(null, { stdout: '', stderr: '' }), (error: Error) => done(error));
  });
});

afterAll(async () => {
  await appDb?.$disconnect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
  process.env.DATABASE_URL = sharedUrl;
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

describe('an Admin Panel restore of a backup made by 1.5.0', () => {
  let answered: request.Response;
  let characters: Array<{ id: string; gameSystem: string | null; data: unknown }>;
  let templates: Array<{ id: string; gameSystem: string | null; data: unknown }>;

  beforeAll(async () => {
    answered = await admin.post('/api/admin/backups/restore').attach('backup', await zipBuffer({ 'database.sql': BACKUP_DUMP }), 'backup.zip');
    // Read the moment the restore has answered, as the next request would.
    characters = await rows(`SELECT id, "gameSystem"::text AS "gameSystem", data FROM "Character" ORDER BY id`);
    templates = await rows(`SELECT id, "gameSystem"::text AS "gameSystem", data FROM "CharacterTemplate" ORDER BY id`);
  });

  it('answers that it is complete', () => {
    expect(answered.status).toBe(200);
    expect(answered.body.message).toMatch(/^Restore complete\./);
  });

  it('has every Horror d100 character and template converted, with no restart', () => {
    const horror = [...characters, ...templates].filter((row) => row.gameSystem === 'HORROR_D100');
    expect(horror).toHaveLength(8);
    for (const row of horror) {
      const data = row.data as Fields;
      // A character and a template each keep the record of their own conversion.
      expect({ id: row.id, old: isOldHorrorD100Sheet(data), converted: (data.converted as Fields | undefined)?.from }).toEqual({ id: row.id, old: false, converted: 1 });
    }
    for (const row of horror.filter((r) => !r.id.endsWith('malformed'))) {
      const parsed = HorrorD100SheetSchema.safeParse(row.data);
      expect({ id: row.id, issues: parsed.success ? [] : parsed.error.issues }).toEqual({ id: row.id, issues: [] });
    }
  });

  it('leaves a Flexible sheet holding the old sheet\'s keys as the backup held it', () => {
    expect(characters.find((row) => row.id === 'character-flexible')?.data).toEqual(JSON.parse(FLEXIBLE));
    expect(templates.find((row) => row.id === 'template-flexible')?.data).toEqual(JSON.parse(FLEXIBLE));
  });

  it('has the systems under their new names, as the migrations give them', async () => {
    expect((await rows<{ gameSystem: string }>(`SELECT "gameSystem"::text AS "gameSystem" FROM "Campaign" WHERE id = 'c1'`))[0].gameSystem).toBe('HORROR_D100');
  });
});
