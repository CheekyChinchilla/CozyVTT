/**
 * Ending an account's login sessions ends its pending two-factor sign-ins too.
 *
 * After a correct password for an account with MFA on, the session holds only
 * `mfaPendingUserId` until the code is entered. Every revocation (a password
 * change or reset, an admin reset, a role change, deleting the account)
 * removed sessions by `userId`, which a pending one never has, so someone who
 * had reached the code step with a password that was then changed kept their
 * chance to finish signing in with it.
 *
 * Runs against the `session` table connect-pg-simple owns in the real app,
 * which the test run's global setup makes; only this file's rows are
 * written and removed. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { destroyUserLoginSessions } from '../sessionStore';

const mine: string[] = [];

async function session(sess: Record<string, unknown>): Promise<string> {
  const sid = `sessionstore-test-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO session (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sess)}::json, NOW() + interval '1 hour')
  `;
  mine.push(sid);
  return sid;
}

async function exists(sid: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ sid: string }[]>`SELECT sid FROM session WHERE sid = ${sid}`;
  return rows.length === 1;
}

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM session WHERE sid IN (${Prisma.join(mine)})`;
  await prisma.$disconnect();
});

it('removes the sessions signed in as the user and those waiting at the two-factor step for the user, and nothing else', async () => {
  const user = randomUUID();
  const other = randomUUID();
  const signedIn = await session({ userId: user, platformRole: 'USER' });
  const pending = await session({ mfaPending: true, mfaPendingUserId: user });
  const otherSignedIn = await session({ userId: other });
  const otherPending = await session({ mfaPending: true, mfaPendingUserId: other });

  expect(await destroyUserLoginSessions(user)).toBe(2);

  expect(await exists(signedIn)).toBe(false);
  expect(await exists(pending)).toBe(false);
  expect(await exists(otherSignedIn)).toBe(true);
  expect(await exists(otherPending)).toBe(true);
});

it('keeps the one session it is asked to keep, and still ends the pending ones', async () => {
  const user = randomUUID();
  const keep = await session({ userId: user });
  const another = await session({ userId: user });
  const pending = await session({ mfaPending: true, mfaPendingUserId: user });

  expect(await destroyUserLoginSessions(user, keep)).toBe(2);

  expect(await exists(keep)).toBe(true);
  expect(await exists(another)).toBe(false);
  expect(await exists(pending)).toBe(false);
});
