/**
 * How a DATABASE_URL written for Prisma reaches the pg driver.
 *
 * The live checks require PostgreSQL at DATABASE_URL.
 */

import { CONNECT_TIMEOUT_MS, createPrismaClient, databaseConnectionSettings } from '../prismaClient';

const BASE = 'postgresql://u:p@db.example:5432/cozy';

describe('databaseConnectionSettings', () => {
  it('passes an address with no Prisma parameters to pg as written, for the public schema', () => {
    const { pool, schema } = databaseConnectionSettings(`${BASE}?sslmode=require`);
    expect(pool.connectionString).toBe(`${BASE}?sslmode=require`);
    expect(schema).toBe('public');
    expect(pool.options).toBe('-c search_path="public"');
    expect(pool.max).toBeUndefined();
    expect(pool.connectionTimeoutMillis).toBe(CONNECT_TIMEOUT_MS);
    expect(CONNECT_TIMEOUT_MS).toBe(5000);
  });

  it('turns ?schema= into the queries\' schema and the connection\'s search_path, and drops it from the address', () => {
    const { pool, schema } = databaseConnectionSettings(`${BASE}?schema=first_admin_race_test&sslmode=require`);
    expect(schema).toBe('first_admin_race_test');
    expect(pool.options).toBe('-c search_path="first_admin_race_test"');
    expect(pool.connectionString).toBe(`${BASE}?sslmode=require`);
  });

  it('turns ?connection_limit= into the pool size, and drops the parameters only Prisma read', () => {
    const { pool } = databaseConnectionSettings(`${BASE}?connection_limit=5&pool_timeout=10&pgbouncer=true`);
    expect(pool.max).toBe(5);
    expect(pool.connectionString).toBe(BASE);
  });

  it('leaves the pool size to pg when the limit is not a positive whole number', () => {
    expect(databaseConnectionSettings(`${BASE}?connection_limit=0`).pool.max).toBeUndefined();
    expect(databaseConnectionSettings(`${BASE}?connection_limit=lots`).pool.max).toBeUndefined();
  });

  it('quotes a schema name for the search_path', () => {
    expect(databaseConnectionSettings(`${BASE}?schema=odd%22name`).pool.options).toBe('-c search_path="odd""name"');
    expect(databaseConnectionSettings(`${BASE}?schema=two%20words`).pool.options).toBe('-c search_path="two\\ words"');
  });
});

describe('createPrismaClient', () => {
  it('makes a client for an empty address, which refuses on its first query', async () => {
    const client = createPrismaClient('');
    await expect(client.$queryRaw`SELECT 1`).rejects.toThrow('DATABASE_URL is not set');
    await client.$disconnect();
  });

  it('gives the connection the search_path ?schema= names', async () => {
    const base = process.env.DATABASE_URL;
    if (!base) throw new Error('This test needs DATABASE_URL');
    const address = new URL(base);
    address.searchParams.set('schema', 'factory_search_path_test');
    const client = createPrismaClient(address.toString());
    try {
      const rows = await client.$queryRaw<{ search_path: string }[]>`SHOW search_path`;
      expect(rows[0].search_path).toBe('"factory_search_path_test"');
    } finally {
      await client.$disconnect();
    }
  });
});
