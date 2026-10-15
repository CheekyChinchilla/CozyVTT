/**
 * An account keeps at most 20 live sign-ins.
 *
 * Every sign-in without a cookie wrote a new session row and nothing capped
 * them per account, so a script signing in 300 times a minute grew the table
 * by hundreds of thousands of rows a day, each living 30 days with remember
 * me, and the Activity tab loaded them all. At sign-in the account's oldest
 * sessions beyond 20 are removed, the one just made kept. Sign-ins waiting at
 * the two-factor step count too.
 *
 * Runs against the `session` table connect-pg-simple owns in the real app,
 * which the test run's global setup makes; only this file's rows are
 * written and removed. Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { capLoginSessions, MAX_SESSIONS_PER_USER } from '../sessionStore';

const mine: string[] = [];

async function session(sess: Record<string, unknown>, expiresInMs: number): Promise<string> {
  const sid = `sessioncap-test-${randomUUID()}`;
  await prisma.$executeRaw`
    INSERT INTO session (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify(sess)}::json, NOW() + (${expiresInMs} || ' milliseconds')::interval)
  `;
  mine.push(sid);
  return sid;
}

async function sidsOf(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ sid: string }[]>`
    SELECT sid FROM session WHERE sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId}
  `;
  return rows.map((r) => r.sid);
}

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM session WHERE sid IN (${Prisma.join(mine)})`;
  await prisma.$disconnect();
});

it('is 20', () => {
  expect(MAX_SESSIONS_PER_USER).toBe(20);
});

it('removes the oldest sessions beyond the cap, keeping the one just made and the newest others', async () => {
  const user = randomUUID();
  // 25 sign-ins, the earliest expiring first; then the one being made now.
  const older: string[] = [];
  for (let i = 0; i < 25; i += 1) older.push(await session({ userId: user }, 60_000 * (i + 1)));
  const pending = await session({ mfaPending: true, mfaPendingUserId: user }, 60_000 * 30);
  const current = await session({ userId: user }, 60_000 * 40);
  const other = await session({ userId: randomUUID() }, 60_000);

  const removed = await capLoginSessions(user, current);

  expect(removed).toBe(27 - MAX_SESSIONS_PER_USER);
  const left = await sidsOf(user);
  expect(left).toHaveLength(MAX_SESSIONS_PER_USER);
  expect(left).toContain(current);
  expect(left).toContain(pending);
  // The newest of the older sessions stay; the oldest go.
  expect(left).toContain(older[24]);
  expect(left).not.toContain(older[0]);
  expect(await sidsOf(JSON.parse((await prisma.$queryRaw<{ sess: string }[]>`SELECT sess::text FROM session WHERE sid = ${other}`)[0].sess).userId)).toEqual([other]);
});

it('removes nothing while the account is within the cap', async () => {
  const user = randomUUID();
  const sids = [await session({ userId: user }, 60_000), await session({ userId: user }, 120_000)];

  expect(await capLoginSessions(user, sids[1])).toBe(0);
  expect((await sidsOf(user)).sort()).toEqual([...sids].sort());
});
