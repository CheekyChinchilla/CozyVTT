/**
 * Runs once, before any test file. Stops the run when the database is not a
 * test database; see testDatabaseGuard.ts for why and what passes.
 */

import path from 'path';
import { effectiveDatabaseUrl, testDatabaseRefusal } from './testDatabaseGuard';

export default function globalSetup(): void {
  const refusal = testDatabaseRefusal(effectiveDatabaseUrl(process.env, path.resolve(__dirname, '..', '..', '..')));
  if (refusal) throw new Error(refusal);
}
