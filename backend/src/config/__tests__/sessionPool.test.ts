/**
 * The login-session store when PostgreSQL drops its connections.
 *
 * node-postgres reports a dropped idle connection as an 'error' event on its
 * pool, as happens when PostgreSQL stops or restarts. The pool behind the
 * session store had no listener for it, and an 'error' event with no
 * listener is thrown, so restarting the database could take the backend
 * down with it.
 *
 * The pool is caught as config/session.ts builds it, so this is the pool the
 * session store reads every request's session through.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import type { Pool } from 'pg';
import { captureLogs } from '../../__tests__/helpers/logCapture';

jest.setTimeout(20000);

const mockPools: Pool[] = [];
jest.mock('pg', () => {
  const actual = jest.requireActual<typeof import('pg')>('pg');
  class RecordedPool extends actual.Pool {
    constructor(...args: ConstructorParameters<typeof actual.Pool>) {
      super(...args);
      mockPools.push(this);
    }
  }
  return { ...actual, Pool: RecordedPool };
});

// Loaded after the mock is in place, so its pool is recorded.
require('../session');
const { Client } = jest.requireActual<typeof import('pg')>('pg');
const pool = mockPools[0];

afterAll(() => pool.end());

/** The database url without the Prisma-only setting the test setup adds. */
function databaseUrl(): string {
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.searchParams.delete('connection_limit');
  return url.toString();
}

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}`);
}

it('keeps working after the database ends an idle connection', async () => {
  const client = await pool.connect();
  const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  client.release();
  expect(pool.idleCount).toBe(1);

  const logs = captureLogs();
  const admin = new Client({ connectionString: databaseUrl() });
  await admin.connect();
  try {
    // What a database shutdown does to every connection it holds.
    await admin.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
  } finally {
    await admin.end();
  }
  await until(() => pool.idleCount === 0, 'the pool to drop the ended connection');

  // The next session read opens a fresh connection.
  const fresh = await pool.query<{ ok: number }>('SELECT 1 AS ok');
  expect(fresh.rows[0].ok).toBe(1);

  const entries = await logs.stop();
  expect(entries.some((e) => e.level === 'error' && e.message === 'Session store lost a database connection')).toBe(true);
});
