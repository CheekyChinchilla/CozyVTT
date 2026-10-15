/**
 * Two administrators acting at the same moment cannot leave the instance with
 * none.
 *
 * Each path that takes an administrator away (giving up the role, deleting
 * one's own account, an administrator deleting another) counted the other
 * administrators and then wrote, as two separate steps. Two of them at once
 * each counted the other, both went ahead, and nobody could reach the Admin
 * Panel again. The count and the write are now one serializable transaction,
 * so the second one sees the first and is refused.
 *
 * "The other administrators" is a count over every account, which the shared
 * test database fills with admins from other files, so this runs on a schema
 * of its own (helpers/isolatedSchema). The count is held back a moment after
 * it answers, which is the window two real requests can overlap in; without
 * the transaction both then read the other administrator and both go ahead.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type express from 'express';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../config/prismaClient';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const PASSWORD = 'LastAdminRace1!Cozy';
const sharedUrl = process.env.DATABASE_URL;

let schema: IsolatedSchema;
let db: PrismaClient;
let app: express.Express;
// Imported once the app's client is set below: anything that imports
// config/database first would make the app use a client of its own.
let hashPassword: (password: string) => Promise<string>;

beforeAll(async () => {
  schema = createIsolatedSchema('last_admin_race_test');
  process.env.DATABASE_URL = schema.url;
  db = createPrismaClient(schema.url);
  // The app's client, which config/database.ts takes from here when it is set.
  (global as unknown as { prisma?: unknown }).prisma = db.$extends({
    query: {
      user: {
        async count({ args, query }) {
          const answer = await query(args);
          await new Promise((resolve) => setTimeout(resolve, 150));
          return answer;
        },
      },
    },
  });
  ({ hashPassword } = require('../../services/auth') as typeof import('../../services/auth'));
  const { createTestApp } = require('../../__tests__/helpers/test-app') as typeof import('../../__tests__/helpers/test-app');
  app = createTestApp();
});

afterAll(async () => {
  await db.$disconnect();
  schema.drop();
  process.env.DATABASE_URL = sharedUrl;
});

/** An instance with exactly two administrators, both signed in. */
async function twoAdmins() {
  await db.user.deleteMany({});
  const passwordHash = await hashPassword(PASSWORD);
  const make = (name: string) =>
    db.user.create({ data: { email: `${name}@race.test`, displayName: name, passwordHash, platformRole: 'ADMIN' } });
  const [a, b] = [await make('alice'), await make('bea')];
  const signIn = async (email: string) => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
    return agent;
  };
  return { a, b, asA: await signIn(a.email), asB: await signIn(b.email) };
}

const admins = () => db.user.count({ where: { platformRole: 'ADMIN' } });

it('keeps one administrator when both give up the role at once', async () => {
  const { a, b, asA, asB } = await twoAdmins();

  const [first, second] = await Promise.all([
    asA.put(`/api/users/${a.id}`).send({ platformRole: 'USER' }),
    asB.put(`/api/users/${b.id}`).send({ platformRole: 'USER' }),
  ]);

  expect(await admins()).toBe(1);
  expect([first.status, second.status].sort()).toEqual([200, 409]);
});

it('keeps one administrator when one deletes the other while being demoted by them', async () => {
  const { a, b, asA, asB } = await twoAdmins();

  const [deletion, demotion] = await Promise.all([
    asA.delete(`/api/users/${b.id}`),
    asB.put(`/api/users/${a.id}`).send({ platformRole: 'USER' }),
  ]);

  expect(await admins()).toBe(1);
  expect([deletion.status, demotion.status].sort()).toEqual([200, 409]);
});

it('keeps one administrator when both delete their own accounts at once', async () => {
  const { asA, asB } = await twoAdmins();

  const [first, second] = await Promise.all([
    asA.delete('/api/auth/account').send({ password: PASSWORD }),
    asB.delete('/api/auth/account').send({ password: PASSWORD }),
  ]);

  expect(await admins()).toBe(1);
  expect([first.status, second.status].sort()).toEqual([200, 409]);
});
