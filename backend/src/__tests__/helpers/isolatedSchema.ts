/**
 * A PostgreSQL schema of a test file's own, holding the full table layout and
 * nothing else.
 *
 * Most suites share one test database and run at the same time, so none of
 * them can count on it being empty. A test of what happens on a brand new
 * instance (the setup wizard, the first account becoming the admin) needs
 * exactly that, so it gets its own schema in the same database: dropped if a
 * crashed run left it, created from schema.prisma, and dropped again at the
 * end. Prisma's command-line tools and the app's client
 * (config/prismaClient.ts) both read the schema from the `schema` parameter
 * of the address, raw queries included.
 *
 * The app's database client reads DATABASE_URL when it is first imported, so
 * a file using this sets DATABASE_URL to `url` and only then loads the app,
 * with `require(...) as typeof import(...)`.
 */

import { execFileSync } from 'child_process';
import path from 'path';

const BACKEND = path.resolve(__dirname, '../../..');
const PRISMA = path.join(BACKEND, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');

export interface IsolatedSchema {
  /** DATABASE_URL for the schema. */
  url: string;
  /** Remove the schema and everything in it. */
  drop(): void;
}

export function createIsolatedSchema(name: string): IsolatedSchema {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`"${name}" is not a plain schema name`);
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('An isolated schema needs DATABASE_URL to name the test database');

  const address = new URL(base);
  address.searchParams.set('schema', name);
  const url = address.toString();

  const drop = (): void => {
    // prisma.config.ts gives the command-line tools DATABASE_URL.
    execFileSync(PRISMA, ['db', 'execute', '--stdin'], {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: base },
      input: `DROP SCHEMA IF EXISTS "${name}" CASCADE;`,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  };

  drop();
  // The schema is empty, so the push has nothing to lose; one that would
  // lose data stops with an error.
  execFileSync(PRISMA, ['db', 'push'], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: url },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { url, drop };
}
