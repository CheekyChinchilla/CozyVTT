/**
 * Sign-ins are kept in the schema DATABASE_URL names.
 *
 * An address may carry `?schema=<name>`. Prisma's queries follow it, the raw
 * ones that end sign-ins included (services/sessionStore.ts), but the pool
 * behind the session store was built from the raw address, which pg reads
 * without the parameter, so it wrote every sign-in to `public.session`. On
 * such an install a password change, an account deletion or a demotion
 * deleted from `<schema>.session`, found nothing there, and every other
 * sign-in carried on.
 *
 * This runs the server's own session settings (config/session.ts) on a
 * schema of its own (helpers/isolatedSchema).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type express from 'express';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../config/prismaClient';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const SCHEMA = 'session_schema_test';
const PASSWORD = 'SessionSchema1!Cozy';
const NEW_PASSWORD = 'SessionSchema2!Cozy';
const sharedUrl = process.env.DATABASE_URL;

let schema: IsolatedSchema;
let db: PrismaClient;
let client: Client;
let app: express.Express;
let session: typeof import('../../config/session');

beforeAll(async () => {
  if (!sharedUrl) throw new Error('This test needs DATABASE_URL');
  schema = createIsolatedSchema(SCHEMA);
  process.env.DATABASE_URL = schema.url;
  db = createPrismaClient(schema.url);
  (global as unknown as { prisma?: unknown }).prisma = db;

  const plain = new URL(sharedUrl);
  plain.searchParams.delete('connection_limit');
  client = new Client({ connectionString: plain.toString() });
  await client.connect();

  // Loaded once DATABASE_URL names the schema, as the server loads them at start.
  session = require('../../config/session') as typeof import('../../config/session');
  const { createApp } = require('../../app') as typeof import('../../app');
  app = createApp({ session: session.sessionConfig, generalApiLimiter: false, setupGate: false });
});

afterAll(async () => {
  await session?.sessionPool.end();
  await client?.end();
  await db?.$disconnect();
  schema?.drop();
  process.env.DATABASE_URL = sharedUrl;
});

/** How many sign-ins `userId` has in `schemaName`'s session table, 0 when it has none. */
async function signIns(schemaName: string, userId: string): Promise<number> {
  const table = await client.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [`"${schemaName}".session`]);
  if (!table.rows[0].t) return 0;
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "${schemaName}".session WHERE sess->>'userId' = $1`,
    [userId]
  );
  return rows[0].n;
}

it('keeps each sign-in in the named schema, and a password change ends the others', async () => {
  const { hashPassword } = require('../../services/auth') as typeof import('../../services/auth');
  const user = await db.user.create({
    data: { email: 'schema-sessions@test.cozyvtt.local', displayName: 'Schema', passwordHash: await hashPassword(PASSWORD) },
  });

  const signIn = async () => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(200);
    return agent;
  };
  const laptop = await signIn();
  const phone = await signIn();

  expect(await signIns(SCHEMA, user.id)).toBe(2);
  expect(await signIns('public', user.id)).toBe(0);
  expect((await phone.get('/api/auth/me')).status).toBe(200);

  const changed = await laptop.post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
  expect(changed.status).toBe(200);

  expect((await phone.get('/api/auth/me')).status).toBe(401);
  expect((await laptop.get('/api/auth/me')).status).toBe(200);
  expect(await signIns(SCHEMA, user.id)).toBe(1);
});

it('sizes the session pool by connection_limit, as the app pool is sized', () => {
  const limit = Number(new URL(schema.url).searchParams.get('connection_limit'));
  expect(limit).toBeGreaterThan(0);
  expect(session.sessionPool.options.max).toBe(limit);
});
