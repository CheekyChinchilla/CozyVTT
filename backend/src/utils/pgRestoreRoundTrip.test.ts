/**
 * A backup and a restore run by the real pg_dump and psql, on an install
 * whose DATABASE_URL names a schema of its own (`?schema=`), in a database it
 * shares with other software.
 *
 * The tools were handed the address with its query string, and libpq refuses
 * the settings only the app reads (`invalid URI query parameter "schema"`),
 * so every backup failed there. And everything a backup and a restore do was
 * written for the `public` schema: a restore began by dropping `public`,
 * which on a shared database is somebody else's data. This dumps a schema of
 * its own, changes the data, restores, and checks that the schema holds the
 * backup again while `public` and a neighbouring schema are exactly as they
 * were left.
 *
 * Needs pg_dump and psql on PATH, as the backend image has them; where they
 * are missing the cases are skipped (utils/pgRestore.test.ts checks the text
 * and arguments the tools are given either way).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { execFile, execFileSync, spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { Client } from 'pg';
import { buildDumpArgs, buildRestoreArgs, pgConnection, prepareDumpForRestore } from './pgRestore';

jest.setTimeout(180000);

const run = promisify(execFile);
const BACKEND = path.resolve(__dirname, '../..');
const PRISMA = path.join(BACKEND, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

const hasTools = ['pg_dump', 'psql'].every((tool) => spawnSync('sh', ['-c', `command -v ${tool}`]).status === 0);
const describeWithTools = hasTools ? describe : describe.skip;

/** The instance's own schema. */
const SCHEMA = 'backup_round_trip_test';
/** Another schema in the same database, as another program would keep. */
const NEIGHBOUR = 'backup_round_trip_neighbour';
/** A table of another program's in `public`. */
const SENTINEL = 'backup_round_trip_sentinel';

const base = process.env.DATABASE_URL ?? '';
/** The instance's address: the test setup's connection_limit, and the schema. */
const instanceUrl = (() => {
  const url = new URL(base);
  url.searchParams.set('schema', SCHEMA);
  return url.toString();
})();

let client: Client;
let dir: string;

const rows = async (sql: string): Promise<string[]> =>
  (await client.query<{ v: string }>(sql)).rows.map((row) => row.v);

describeWithTools('a backup of an install whose DATABASE_URL names a schema', () => {
  beforeAll(async () => {
    const plain = new URL(base);
    plain.searchParams.delete('connection_limit');
    client = new Client({ connectionString: plain.toString() });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await client.query(`DROP SCHEMA IF EXISTS "${NEIGHBOUR}" CASCADE`);
    await client.query(`DROP TABLE IF EXISTS public."${SENTINEL}"`);

    // An install's schema as its migrations make it.
    execFileSync(PRISMA, ['migrate', 'deploy'], {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: instanceUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await client.query(`CREATE TABLE public."${SENTINEL}" (v text)`);
    await client.query(`INSERT INTO public."${SENTINEL}" VALUES ('before the backup')`);
    await client.query(`CREATE SCHEMA "${NEIGHBOUR}"`);
    await client.query(`CREATE TABLE "${NEIGHBOUR}".kept (v text)`);
    await client.query(`INSERT INTO "${NEIGHBOUR}".kept VALUES ('before the backup')`);
    await client.query(
      `INSERT INTO "${SCHEMA}"."User" (id, email, "displayName", "passwordHash", "updatedAt")
       VALUES ('in-the-backup', 'backup@test.cozyvtt.local', 'In the backup', 'x', NOW())`
    );
    await client.query(
      `INSERT INTO "${SCHEMA}".session (sid, sess, expire) VALUES ('signed-in-then', '{"userId":"in-the-backup"}', NOW() + interval '1 hour')`
    );

    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cozyvtt-round-trip-'));
    // The tools may run as another user (a container); the folder is a test's own.
    await fs.chmod(dir, 0o777);
  });

  afterAll(async () => {
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await client.query(`DROP SCHEMA IF EXISTS "${NEIGHBOUR}" CASCADE`);
      await client.query(`DROP TABLE IF EXISTS public."${SENTINEL}"`);
      await client.end();
    }
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  });

  const dumpPath = () => path.join(dir, 'database.sql');

  it('dumps the named schema alone, without its sign-ins', async () => {
    await run('pg_dump', buildDumpArgs(instanceUrl, dumpPath()), { env: pgConnection(instanceUrl).env });

    const dump = await fs.readFile(dumpPath(), 'utf8');
    expect(dump).toMatch(new RegExp(`^CREATE TABLE ${SCHEMA}\\."User" \\($`, 'm'));
    expect(dump).not.toMatch(/^CREATE TABLE public\./m);
    expect(dump).not.toContain(NEIGHBOUR);
    expect(dump).toMatch(new RegExp(`^COPY ${SCHEMA}\\."User" `, 'm'));
    expect(dump).not.toMatch(new RegExp(`^COPY ${SCHEMA}\\.session `, 'm'));
  });

  it('restores into that schema, leaving public and every other schema as they were', async () => {
    // What happens on the instance after the backup.
    await client.query(`DELETE FROM "${SCHEMA}"."User"`);
    await client.query(
      `INSERT INTO "${SCHEMA}"."User" (id, email, "displayName", "passwordHash", "updatedAt")
       VALUES ('after-the-backup', 'later@test.cozyvtt.local', 'Later', 'x', NOW())`
    );
    await client.query(`INSERT INTO public."${SENTINEL}" VALUES ('after the backup')`);
    await client.query(`INSERT INTO "${NEIGHBOUR}".kept VALUES ('after the backup')`);
    const migrations = await rows(`SELECT count(*)::text AS v FROM "${SCHEMA}"._prisma_migrations`);

    const restorePath = path.join(dir, 'restore.sql');
    const { refused } = await prepareDumpForRestore(dumpPath(), restorePath, instanceUrl);
    expect(refused).toBeNull();
    await run('psql', buildRestoreArgs(instanceUrl, restorePath), { env: pgConnection(instanceUrl).env });

    expect(await rows(`SELECT id AS v FROM "${SCHEMA}"."User" ORDER BY id`)).toEqual(['in-the-backup']);
    expect(await rows(`SELECT sid AS v FROM "${SCHEMA}".session`)).toEqual([]);
    expect(await rows(`SELECT count(*)::text AS v FROM "${SCHEMA}"._prisma_migrations`)).toEqual(migrations);
    expect(await rows(`SELECT v FROM public."${SENTINEL}" ORDER BY v`)).toEqual(['after the backup', 'before the backup']);
    expect(await rows(`SELECT v FROM "${NEIGHBOUR}".kept ORDER BY v`)).toEqual(['after the backup', 'before the backup']);
    // The app's own tables in public, which the shared test database holds, are still there.
    expect(await rows(`SELECT to_regclass('public."User"')::text AS v`)).toEqual(['"User"']);
  });

  it.each([
    ['keeps its data in public', base],
    ['names another schema', (() => {
      const url = new URL(base);
      url.searchParams.set('schema', 'backup_round_trip_elsewhere');
      return url.toString();
    })()],
  ])('is refused by an instance that %s, before anything is loaded', async (_label, otherUrl) => {
    const { refused } = await prepareDumpForRestore(dumpPath(), path.join(dir, 'elsewhere.sql'), otherUrl);
    expect(refused).toMatch(new RegExp(`"${SCHEMA}"`));
  });
});
