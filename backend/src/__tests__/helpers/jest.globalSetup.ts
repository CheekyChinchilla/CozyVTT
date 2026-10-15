/**
 * Runs once, before any test file.
 *
 * Stops the run when the database is not a test database; see
 * testDatabaseGuard.ts for why and what passes. The sign-in table the suites
 * write to when they end an account's sign-ins is part of schema.prisma, so
 * `prisma db push` lays it out with everything else.
 */

import path from 'path';
import { effectiveDatabaseUrl, testDatabaseRefusal } from './testDatabaseGuard';

export default async function globalSetup(): Promise<void> {
  const url = effectiveDatabaseUrl(process.env, path.resolve(__dirname, '..', '..', '..'));
  const refusal = testDatabaseRefusal(url);
  if (refusal) throw new Error(refusal);
}
