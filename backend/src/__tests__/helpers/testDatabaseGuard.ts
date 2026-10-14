/**
 * Whether a database is one the test suite may write to.
 *
 * The suites write to the database freely, on the understanding that it is a
 * throwaway one: they add accounts and campaigns, some change the instance's
 * settings, and some create and drop schemas of their own. With DATABASE_URL
 * unset, Prisma and dotenv fall back to backend/.env, which the development
 * guide points at the development database. So the run is refused unless the
 * database's name has `test` in it as a word: `cozyvtt_test`,
 * `cozyvtt_test_b10` and `test_cozyvtt` pass, `cozyvtt` and `contest` do not.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const TEST_WORD = /(^|[_-])test([_-]|$)/i;

/** Why the suite may not run against this database, or null when it may. */
export function testDatabaseRefusal(url: string | undefined): string | null {
  // Nothing to protect: the suites that need a database fail to connect, and
  // the ones that do not can still run.
  if (url === undefined || url.trim() === '') return null;

  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    return 'The test suite cannot read the database name from DATABASE_URL, so it will not run against it.';
  }

  if (TEST_WORD.test(name)) return null;
  return (
    `The test suite will not run against the database "${name}": its name has no "test" in it, so it may hold real data, ` +
    'and the suites delete rows. Set DATABASE_URL to a throwaway test database, such as ' +
    'postgresql://cozyvtt:cozyvtt@localhost:55500/cozyvtt_test (docs/DEVELOPMENT.md, "Running Tests").'
  );
}

/**
 * The database a run would use: DATABASE_URL from the environment, or else
 * the one backend/.env or backend/prisma/.env names, which is where Prisma
 * and dotenv look when the environment has none.
 */
export function effectiveDatabaseUrl(env: NodeJS.ProcessEnv, backendDir: string): string | undefined {
  if (env.DATABASE_URL !== undefined && env.DATABASE_URL !== '') return env.DATABASE_URL;
  for (const file of [path.join(backendDir, '.env'), path.join(backendDir, 'prisma', '.env')]) {
    if (!fs.existsSync(file)) continue;
    const parsed = dotenv.parse(fs.readFileSync(file));
    if (parsed.DATABASE_URL) return parsed.DATABASE_URL;
  }
  return undefined;
}
