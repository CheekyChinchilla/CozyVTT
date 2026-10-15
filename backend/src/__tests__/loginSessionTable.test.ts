/**
 * The sign-in table is part of the schema.
 *
 * connect-pg-simple keeps sign-ins in a `session` table and makes it when the
 * server first starts. schema.prisma describes it (an @@ignore'd model), and
 * a migration makes it with IF NOT EXISTS, so `prisma db push` keeps it, a
 * new database gets it from `migrate deploy`, and an instance that already
 * has it, with everyone's sign-ins in it, is left exactly as it was.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';
import { createIsolatedSchema, type IsolatedSchema } from './helpers/isolatedSchema';

jest.setTimeout(60000);

const BACKEND = path.resolve(__dirname, '../..');
const PRISMA = path.join(BACKEND, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const MIGRATIONS = path.join(BACKEND, 'prisma', 'migrations');
const MIGRATION = fs.readdirSync(MIGRATIONS).find((name) => name.endsWith('_add_login_session_table'));
const TABLE_SQL = path.join(path.dirname(require.resolve('connect-pg-simple/package.json')), 'table.sql');

const PUSHED = 'login_session_pushed_test';
const STORE = 'login_session_store_test';
const MIGRATED = 'login_session_migrated_test';

const base = process.env.DATABASE_URL;
let pushed: IsolatedSchema;
let client: Client;

/** Runs SQL with unqualified names inside `schema`. */
async function inSchema(schema: string, sql: string): Promise<void> {
  await client.query(`SET search_path TO "${schema}"`);
  try {
    await client.query(sql);
  } finally {
    await client.query('RESET search_path');
  }
}

/** The table's columns and indexes, in a form two schemas can be compared by. */
async function layout(schema: string) {
  const columns = await client.query(
    `SELECT column_name, data_type, character_maximum_length, datetime_precision, is_nullable
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'session' ORDER BY column_name`,
    [schema]
  );
  const indexes = await client.query<{ indexname: string; indexdef: string }>(
    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = 'session' ORDER BY indexname",
    [schema]
  );
  return {
    columns: columns.rows,
    indexes: indexes.rows.map((row) => ({ ...row, indexdef: row.indexdef.replace(`${schema}.`, '') })),
  };
}

const sids = async (schema: string) =>
  (await client.query<{ sid: string }>(`SELECT sid FROM "${schema}"."session" ORDER BY sid`)).rows.map((row) => row.sid);

beforeAll(async () => {
  if (!base) throw new Error('This test needs DATABASE_URL');
  if (!MIGRATION) throw new Error('No migration makes the sign-in table');
  client = new Client({ connectionString: base });
  await client.connect();
  for (const schema of [STORE, MIGRATED]) {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}"`);
  }
  // The table as the running server makes it.
  await inSchema(STORE, fs.readFileSync(TABLE_SQL, 'utf8'));
  pushed = createIsolatedSchema(PUSHED);
});

afterAll(async () => {
  for (const schema of [STORE, MIGRATED]) await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
  pushed.drop();
});

it('is laid out by db push exactly as connect-pg-simple makes it', async () => {
  const store = await layout(STORE);
  expect(store.indexes.map((index) => index.indexname)).toEqual(['IDX_session_expire', 'session_pkey']);
  expect(await layout(PUSHED)).toEqual(store);
});

it('is kept, with its rows, when db push runs again', async () => {
  await client.query(`INSERT INTO "${PUSHED}"."session" (sid, sess, expire) VALUES ('kept', '{}', NOW() + interval '1 hour')`);
  execFileSync(PRISMA, ['db', 'push'], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: pushed.url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  expect(await sids(PUSHED)).toEqual(['kept']);
});

it('is made by its migration as connect-pg-simple makes it, on a database without one', async () => {
  const sql = fs.readFileSync(path.join(MIGRATIONS, MIGRATION ?? '', 'migration.sql'), 'utf8');
  await inSchema(MIGRATED, sql);
  expect(await layout(MIGRATED)).toEqual(await layout(STORE));
});

it('is left alone by its migration where the server already made it, sign-ins included', async () => {
  await client.query(`INSERT INTO "${STORE}"."session" (sid, sess, expire) VALUES ('signed-in', '{"userId":"u"}', NOW() + interval '1 hour')`);
  const before = await layout(STORE);
  const sql = fs.readFileSync(path.join(MIGRATIONS, MIGRATION ?? '', 'migration.sql'), 'utf8');
  await inSchema(STORE, sql);
  await inSchema(STORE, sql);
  expect(await layout(STORE)).toEqual(before);
  expect(await sids(STORE)).toEqual(['signed-in']);
});
