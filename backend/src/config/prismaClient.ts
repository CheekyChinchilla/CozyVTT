/**
 * How the backend makes a Prisma client. Importing this connects to nothing;
 * config/database.ts holds the app's own client, made from it.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import logger from '../utils/logger';

/**
 * Query parameters a Prisma database address may carry that the pg driver
 * does not understand. `schema` and `connection_limit` are translated below;
 * the rest only tuned Prisma's own connection engine, which is gone. libpq,
 * which pg_dump and psql connect with, refuses every one of them, so a backup
 * or restore leaves them out too (utils/pgRestore.ts).
 */
export const PRISMA_ONLY_PARAMETERS: readonly string[] = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'socket_timeout',
  'pgbouncer',
  'statement_cache_size',
  'max_connection_lifetime',
  'max_idle_connection_lifetime',
];

/** How long a new database connection may take before the query fails. */
export const CONNECT_TIMEOUT_MS = 5000;

export interface DatabaseConnectionSettings {
  /** What the pg pool is given. */
  pool: PoolConfig;
  /** The PostgreSQL schema Prisma's queries name, `public` unless the address says otherwise. */
  schema: string;
}

/**
 * What a DATABASE_URL written for Prisma means to the pg driver.
 *
 * Addresses keep the form Prisma has always read. `?schema=` (the test
 * suite's isolated schemas use it) names the schema Prisma's queries are
 * qualified with, and also becomes the connection's search_path, since the
 * raw queries name their tables unqualified and pg ignores the parameter.
 * `?connection_limit=` becomes the pool's size; without it pg opens up to
 * ten. Parameters only Prisma's old engine read are dropped; everything
 * else, such as `sslmode`, is pg's to read.
 */
export function databaseConnectionSettings(url: string): DatabaseConnectionSettings {
  let address: URL;
  try {
    address = new URL(url);
  } catch {
    // Not something URL can read; pg gets it as written, and says what is wrong.
    return {
      pool: { connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS, options: '-c search_path="public"' },
      schema: 'public',
    };
  }

  const params = address.searchParams;
  const schema = params.get('schema') || 'public';
  const limit = Number(params.get('connection_limit'));
  const hadPrismaParameters = PRISMA_ONLY_PARAMETERS.some((name) => params.has(name));
  for (const name of PRISMA_ONLY_PARAMETERS) params.delete(name);

  // libpq's `options` splits on spaces and reads backslashes as escapes.
  const quoted = `"${schema.replace(/"/g, '""')}"`.replace(/\\/g, '\\\\').replace(/ /g, '\\ ');
  return {
    pool: {
      // An address with nothing to remove reaches pg exactly as written.
      connectionString: hadPrismaParameters ? address.toString() : url,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      options: `-c search_path=${quoted}`,
      ...(Number.isInteger(limit) && limit > 0 ? { max: limit } : {}),
    },
    schema,
  };
}

/**
 * Stands in for the driver when DATABASE_URL is empty. pg would otherwise
 * try a database on this machine under the system user's name. Refusing on
 * the first query leaves importing the client harmless: the server's own
 * check (config/databaseGuard.ts) speaks first, and test files that never
 * touch the database still load.
 */
class MissingDatabaseUrl extends PrismaPg {
  async connect(): Promise<never> {
    throw new Error('DATABASE_URL is not set, so there is no database to connect to.');
  }
}

/**
 * PostgreSQL refusing a transaction for overlapping another, as Prisma
 * reports it: 40001 (a serialization failure) or 40P01 (a deadlock) from a
 * raw statement, and P2034's message from a query Prisma built.
 */
const CONFLICT_REPORT = /Code: `40001`|Code: `40P01`|Transaction failed due to a write conflict or a deadlock/;

/**
 * The level Prisma's error report `message` is logged at. A conflict is run
 * again by utils/serializable.ts, which logs if the runs are used up, so each
 * one is debug; anything else is an error.
 */
export function prismaErrorLevel(message: string): 'error' | 'debug' {
  return CONFLICT_REPORT.test(message) ? 'debug' : 'error';
}

/**
 * Makes a Prisma client for the database at `url`. Every client in the
 * backend, its scripts and its tests is made here, so each reads its address
 * the same way.
 *
 * Prisma's errors and warnings go through the project logger, never straight
 * to the terminal. A validation error quotes the query's arguments in full, a
 * value a client sent among them, and the logger is what masks email
 * addresses and clips a value of absurd length. `target` names the model and
 * operation (`character.findUnique`); the error a caller catches carries the
 * code and is logged where it is caught. Development also prints each query.
 */
export function createPrismaClient(url: string | undefined = process.env.DATABASE_URL): PrismaClient {
  let adapter: PrismaPg;
  if (url) {
    const { pool, schema } = databaseConnectionSettings(url);
    adapter = new PrismaPg(pool, {
      schema,
      // An idle connection is dropped whenever PostgreSQL stops or restarts;
      // the pool opens a new one for the next query.
      onPoolError: (err) => logger.error('Database connection lost', { detail: err.message }),
    });
  } else {
    adapter = new MissingDatabaseUrl({});
  }

  const client = new PrismaClient({
    adapter,
    log: [
      ...(process.env.NODE_ENV === 'development' ? [{ emit: 'stdout' as const, level: 'query' as const }] : []),
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
  client.$on('error', (e) => logger.log(prismaErrorLevel(e.message), 'Database error', { target: e.target, detail: e.message }));
  client.$on('warn', (e) => logger.warn('Database warning', { target: e.target, detail: e.message }));
  return client;
}
