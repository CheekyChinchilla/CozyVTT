/**
 * Runs once, before any test file.
 *
 * Stops the run when the database is not a test database; see
 * testDatabaseGuard.ts for why and what passes. Then makes the sign-in table
 * connect-pg-simple keeps, which `prisma db push` drops; see
 * loginSessionTable.ts. Without it, every suite that ends an account's
 * sign-ins failed after a push unless another file happened to make the
 * table first.
 */

import path from 'path';
import { Client } from 'pg';
import { effectiveDatabaseUrl, testDatabaseRefusal } from './testDatabaseGuard';
import { loginSessionTableSql, schemaOf } from './loginSessionTable';

export default async function globalSetup(): Promise<void> {
  const url = effectiveDatabaseUrl(process.env, path.resolve(__dirname, '..', '..', '..'));
  const refusal = testDatabaseRefusal(url);
  if (refusal) throw new Error(refusal);
  if (url === undefined || url.trim() === '') return;

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch (error) {
    // The suites that need the database fail on their own, saying so; the
    // ones that do not still run.
    console.warn(`The test database could not be reached, so the sign-in table was not made: ${String(error)}`);
    return;
  }
  try {
    await client.query(loginSessionTableSql(schemaOf(url)));
  } finally {
    await client.end();
  }
}
