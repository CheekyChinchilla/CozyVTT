/**
 * The sign-in table connect-pg-simple keeps, for test databases.
 *
 * The server makes it when it starts (config/session.ts asks connect-pg-simple
 * to). schema.prisma does not describe it, so `prisma db push` drops it and
 * leaves it out of a schema it builds, and the test app never starts the
 * server. Ending an account's sign-ins writes to it, so the run's global setup
 * makes it, and so does every isolated schema.
 *
 * The definition is read from connect-pg-simple's own table.sql, the file it
 * runs itself, so the tests' table is the server's, key and index included.
 */

import fs from 'fs';
import path from 'path';

const TABLE_SQL = path.join(path.dirname(require.resolve('connect-pg-simple/package.json')), 'table.sql');

/** The `schema` a Prisma database address names, or `public`. */
export function schemaOf(databaseUrl: string): string {
  return new URL(databaseUrl).searchParams.get('schema') ?? 'public';
}

/**
 * One statement that makes the table in `schema` unless it is there already.
 * connect-pg-simple names the table `"session"` in its file and puts its own
 * name in place of that when it runs it; the same is done here.
 */
export function loginSessionTableSql(schema: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error(`"${schema}" is not a plain schema name`);
  const table = `"${schema}"."session"`;
  const create = fs.readFileSync(TABLE_SQL, 'utf8').replace(/"session"/g, table);
  return `DO $cozyvtt$ BEGIN IF to_regclass('${table}') IS NULL THEN ${create} END IF; END $cozyvtt$;`;
}
