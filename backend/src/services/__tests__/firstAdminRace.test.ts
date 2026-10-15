/**
 * Exactly one first-boot admin, even under concurrent registration.
 *
 * `registerUser` decides the platform role from a count of users and then
 * creates the row. Two registrations racing on an empty instance both read
 * zero and both become ADMIN: a standing admin account for whoever wins the
 * race against the operator opening the setup wizard on a fresh, internet-
 * facing install. An advisory lock serialises the two steps.
 *
 * The case only exists on an empty instance. On the shared test database,
 * where other suites have always created users, every racer becomes a USER
 * and a check of "at most one admin" passes with or without the lock. So this
 * runs on a schema of its own, refuses to run if that schema holds a user,
 * and expects exactly one admin.
 *
 * Real registrations rarely overlap: the password hash, made before the
 * locked step, takes a varying time and spreads them out. So the hash is made
 * instant here, and the count of users is held back a moment before it
 * answers, which is the window the lock closes. Without the lock every racer
 * then reads zero and becomes an admin.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, __esModule: true, default: { ...actual, hash: async () => '$argon2id$v=19$m=65536,t=3,p=4$race' } };
});

import { PrismaClient } from '@prisma/client';
import { createIsolatedSchema, type IsolatedSchema } from '../../__tests__/helpers/isolatedSchema';

jest.setTimeout(60000);

const sharedUrl = process.env.DATABASE_URL;
const emails = Array.from({ length: 8 }, (_, i) => `race-${i}@test.cozyvtt.local`);

let schema: IsolatedSchema;
let db: PrismaClient;

beforeAll(() => {
  schema = createIsolatedSchema('first_admin_race_test');
  process.env.DATABASE_URL = schema.url;
  db = new PrismaClient({ datasources: { db: { url: schema.url } } });
});

afterAll(async () => {
  await db.$disconnect();
  schema.drop();
  process.env.DATABASE_URL = sharedUrl;
});

it('makes exactly one ADMIN when registrations race on an empty instance', async () => {
  // The precondition the test depends on, checked, not assumed.
  const existing = await db.user.count();
  if (existing !== 0) throw new Error(`The race needs an instance with no users; this one has ${existing}`);

  // The app's client, which config/database.ts takes from here when it is set.
  (global as unknown as { prisma?: unknown }).prisma = db.$extends({
    query: {
      user: {
        async count({ args, query }) {
          const answer = await query(args);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return answer;
        },
      },
    },
  });
  const { registerUser } = await import('../auth');
  const results = await Promise.allSettled(
    emails.map((email) => registerUser({ email, password: 'RaceTest123!Cozy', displayName: 'Race' }))
  );

  expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
  expect(await db.user.count()).toBe(emails.length);
  expect(await db.user.count({ where: { platformRole: 'ADMIN' } })).toBe(1);
});
