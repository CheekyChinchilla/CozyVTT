/**
 * Whether a database is one the test suite may write to.
 *
 * The suites write to the database freely, on the understanding that it is a
 * throwaway one: they add accounts and campaigns, some change the instance's
 * settings, and some create and drop schemas of their own. With DATABASE_URL
 * unset, dotenv fills it from backend/.env (the server and the scripts load
 * it, and so does prisma.config.ts for the Prisma command-line tools the
 * suites run), and the development guide points that file at the development
 * database. So the run is refused unless the
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
 * the one backend/.env names, where dotenv looks when the environment has
 * none. backend/prisma/.env is checked too: Prisma read it before version 7,
 * so an older checkout may still keep its address there.
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
