/**
 * Every run starts with the sign-in table in place.
 *
 * The server keeps sign-ins in a `session` table that connect-pg-simple makes
 * when the server starts, and the test app never starts the server. Ending an
 * account's sign-ins (account deletion, a password change or reset, a role
 * change) writes to it. schema.prisma now describes it, so `prisma db push`
 * lays it out (loginSessionTable.test.ts); the run's global setup still makes
 * it, from connect-pg-simple's own definition, where it is missing.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { Client } from 'pg';
import globalSetup from './helpers/jest.globalSetup';
import { createIsolatedSchema, type IsolatedSchema } from './helpers/isolatedSchema';

jest.setTimeout(60000);

const SCHEMA = 'global_setup_test';
const original = process.env.DATABASE_URL;
let schema: IsolatedSchema;

/** What the schema holds of the sign-in table: whether it exists, and its index names. */
async function sessionTable(): Promise<{ present: boolean; indexes: string[] }> {
  const client = new Client({ connectionString: original });
  await client.connect();
  try {
    const present = await client.query<{ present: boolean }>(
      'SELECT to_regclass($1) IS NOT NULL AS present',
      [`"${SCHEMA}"."session"`]
    );
    const indexes = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'session' ORDER BY indexname",
      [SCHEMA]
    );
    return { present: present.rows[0]?.present === true, indexes: indexes.rows.map((r) => r.indexname) };
  } finally {
    await client.end();
  }
}

beforeAll(() => {
  // A schema of its own, laid out from schema.prisma alone, as `db push` leaves a database.
  schema = createIsolatedSchema(SCHEMA);
});

async function dropTable(): Promise<void> {
  const client = new Client({ connectionString: original });
  await client.connect();
  try {
    await client.query(`DROP TABLE "${SCHEMA}"."session"`);
  } finally {
    await client.end();
  }
}

afterAll(() => {
  process.env.DATABASE_URL = original;
  schema.drop();
});

it('starts from a schema with the table, as a push leaves it', async () => {
  expect(await sessionTable()).toEqual({ present: true, indexes: ['IDX_session_expire', 'session_pkey'] });
});

it('makes the table connect-pg-simple makes, with its key and its expiry index, where it is missing', async () => {
  await dropTable();
  expect((await sessionTable()).present).toBe(false);
  process.env.DATABASE_URL = schema.url;
  await globalSetup();

  expect(await sessionTable()).toEqual({ present: true, indexes: ['IDX_session_expire', 'session_pkey'] });
});

it('leaves a table that is already there alone', async () => {
  process.env.DATABASE_URL = schema.url;
  const client = new Client({ connectionString: original });
  await client.connect();
  try {
    await client.query(`INSERT INTO "${SCHEMA}"."session" (sid, sess, expire) VALUES ('kept', '{}', NOW() + interval '1 hour')`);
    await globalSetup();
    const rows = await client.query<{ sid: string }>(`SELECT sid FROM "${SCHEMA}"."session"`);
    expect(rows.rows.map((r) => r.sid)).toEqual(['kept']);
  } finally {
    await client.end();
  }
});
