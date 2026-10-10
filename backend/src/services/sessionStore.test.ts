/**
 * Ending a user's login sessions, and the one case that keeps one.
 *
 * These rows belong to connect-pg-simple, not to Prisma, so the table is
 * created here to exercise the real SQL. The production app creates it at
 * startup; the test app keeps sessions in memory and never makes it. Other
 * suites read the table at the same time, so this one touches only its own
 * rows and leaves the table in place.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { prisma } from '../config/database';
import { destroyUserLoginSessions } from './sessionStore';
import { ensureLoginSessionTable } from '../__tests__/helpers/db';

const ALICE = 'user-alice';
const BOB = 'user-bob';

async function addSession(sid: string, userId: string) {
  await prisma.$executeRaw`
    INSERT INTO session (sid, sess, expire)
    VALUES (${sid}, ${JSON.stringify({ userId })}::json, NOW() + INTERVAL '1 hour')
  `;
}

const sidsFor = async (userId: string): Promise<string[]> => {
  const rows = await prisma.$queryRaw<{ sid: string }[]>`
    SELECT sid FROM session WHERE sess->>'userId' = ${userId} ORDER BY sid
  `;
  return rows.map((r) => r.sid);
};

const removeOwnRows = () =>
  prisma.$executeRaw`DELETE FROM session WHERE sess->>'userId' IN (${ALICE}, ${BOB})`;

beforeAll(async () => {
  await ensureLoginSessionTable();
});

beforeEach(async () => {
  await removeOwnRows();
  await addSession('alice-laptop', ALICE);
  await addSession('alice-phone', ALICE);
  await addSession('alice-tablet', ALICE);
  await addSession('bob-laptop', BOB);
});

afterAll(async () => {
  await removeOwnRows();
  await prisma.$disconnect();
});

describe('destroyUserLoginSessions', () => {
  it('ends every session the user has', async () => {
    const removed = await destroyUserLoginSessions(ALICE);
    expect(removed).toBe(3);
    expect(await sidsFor(ALICE)).toEqual([]);
  });

  it('leaves other people signed in', async () => {
    await destroyUserLoginSessions(ALICE);
    expect(await sidsFor(BOB)).toEqual(['bob-laptop']);
  });

  it('keeps the one session it is told to keep', async () => {
    // What a password change needs: sign out the other devices, and leave the
    // person who just changed it where they are.
    const removed = await destroyUserLoginSessions(ALICE, 'alice-phone');
    expect(removed).toBe(2);
    expect(await sidsFor(ALICE)).toEqual(['alice-phone']);
  });

  it('still ends the rest when the kept session is not theirs', async () => {
    const removed = await destroyUserLoginSessions(ALICE, 'bob-laptop');
    expect(removed).toBe(3);
    expect(await sidsFor(ALICE)).toEqual([]);
    expect(await sidsFor(BOB)).toEqual(['bob-laptop']);
  });
});
