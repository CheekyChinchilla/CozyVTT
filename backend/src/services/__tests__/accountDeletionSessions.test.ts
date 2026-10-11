/**
 * Deleting an account removes its login sessions in the same transaction.
 *
 * The sessions were removed after the deletion had committed, by a helper
 * that swallowed errors. A failure there left the deleted account's other
 * sign-ins alive, carrying their copy of the role, until they expired. The
 * removal is now part of the deletion's own transaction: either both happen
 * or neither does.
 *
 * Runs against the `session` table connect-pg-simple owns in the real app,
 * created here if the test database has none; only this file's rows are
 * written and removed. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { createTestUser, cleanupUsers } from '../../__tests__/helpers/db';
import { deleteAccount } from '../accountDeletion';

const mine: string[] = [];
const created: string[] = [];

async function session(sess: Record<string, unknown>): Promise<string> {
  const sid = `deletion-test-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO session (sid, sess, expire) VALUES (${sid}, ${JSON.stringify(sess)}::json, NOW() + interval '1 hour')
  `;
  mine.push(sid);
  return sid;
}

async function exists(sid: string): Promise<boolean> {
  return (await prisma.$queryRaw<{ sid: string }[]>`SELECT sid FROM session WHERE sid = ${sid}`).length === 1;
}

beforeAll(async () => {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    )
  `;
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM session WHERE sid IN (${Prisma.join(mine)})`;
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('removes the account\'s sessions, pending two-factor sign-ins included, with the account', async () => {
  const user = await createTestUser({ displayName: 'Leaving' });
  created.push(user.id);
  const bystander = await createTestUser({ displayName: 'Staying' });
  created.push(bystander.id);
  const signedIn = await session({ userId: user.id, platformRole: 'ADMIN' });
  const pending = await session({ mfaPending: true, mfaPendingUserId: user.id });
  const other = await session({ userId: bystander.id });

  const result = await deleteAccount(user.id);

  expect(result.deleted).toBe(true);
  expect(await exists(signedIn)).toBe(false);
  expect(await exists(pending)).toBe(false);
  expect(await exists(other)).toBe(true);
});
