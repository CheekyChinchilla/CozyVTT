/**
 * What the run's global setup does: it refuses a database that is not a test
 * database, and leaves the database as `prisma db push` laid it out.
 *
 * The suites that end an account's sign-ins (account deletion, a password
 * change or reset, a role change) write to the `session` table. The setup
 * used to make it, because `db push` dropped it; schema.prisma now describes
 * it, so a pushed database has it (loginSessionTable.test.ts).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { Client } from 'pg';
import globalSetup from './helpers/jest.globalSetup';

const original = process.env.DATABASE_URL;

afterEach(() => {
  process.env.DATABASE_URL = original;
});

it('refuses a database without test in its name', async () => {
  process.env.DATABASE_URL = 'postgresql://cozyvtt:cozyvtt@localhost:5432/cozyvtt';
  await expect(globalSetup()).rejects.toThrow('The test suite will not run against the database "cozyvtt"');
});

it('lets the test database through, with its sign-in table and the rows in it untouched', async () => {
  const client = new Client({ connectionString: original });
  await client.connect();
  try {
    await client.query(`INSERT INTO "session" (sid, sess, expire) VALUES ('global-setup-kept', '{}', NOW() + interval '1 hour')`);
    await expect(globalSetup()).resolves.toBeUndefined();
    const rows = await client.query<{ sid: string }>(`SELECT sid FROM "session" WHERE sid = 'global-setup-kept'`);
    expect(rows.rows.map((row) => row.sid)).toEqual(['global-setup-kept']);
  } finally {
    await client.query(`DELETE FROM "session" WHERE sid = 'global-setup-kept'`);
    await client.end();
  }
});
