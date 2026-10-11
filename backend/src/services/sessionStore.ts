import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

/**
 * Login-session helpers.
 *
 * Express login sessions live in the `session` table owned by
 * connect-pg-simple (see config/session.ts) — not in Prisma's `Session` model,
 * which tracks in-game campaign sessions. The same raw-SQL access pattern is
 * used by the admin activity endpoint's online-users list.
 */

/**
 * End every login session belonging to a user, the sign-ins waiting at the
 * two-factor step included.
 *
 * Used when an admin resets someone's password, when their role or permissions
 * change, and when their account is deleted (inside the deletion's own
 * transaction, through `db`): the guards read the role from the session and
 * nothing re-reads it, so without this the person keeps whatever they had
 * until they happen to sign out.
 *
 * A session that has passed the password step but not the code holds only
 * `mfaPendingUserId`. It goes too: the password it proved is the one being
 * replaced, so it must not be turned into a sign-in afterwards.
 *
 * `exceptSessionId` keeps one session alive, which is what a self-service
 * password change wants: the other devices are signed out and the person who
 * just changed it stays where they are.
 *
 * @returns number of sessions removed
 */
export async function destroyUserLoginSessions(
  userId: string,
  exceptSessionId?: string,
  db: Prisma.TransactionClient = prisma
): Promise<number> {
  // Not caught: a revocation that did not take must fail the request that
  // asked for it, so the person is told, instead of reporting success while
  // the old sessions keep their role until they expire.
  return exceptSessionId
    ? db.$executeRaw`
        DELETE FROM session
        WHERE (sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId})
          AND sid <> ${exceptSessionId}
      `
    : db.$executeRaw`
        DELETE FROM session
        WHERE sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId}
      `;
}

/**
 * How many live sessions one account keeps. Every sign-in without a cookie
 * writes a row, and nothing capped them, so a script signing in 300 times a
 * minute grew the table by hundreds of thousands of rows a day, each living 30
 * days with remember me. Twenty is far more devices and browsers than a
 * person signs in from; a sign-in past it ends the account's oldest.
 */
export const MAX_SESSIONS_PER_USER = 20;

/**
 * Called at sign-in with the new session's id: removes the account's oldest
 * sessions (those expiring soonest, pending two-factor sign-ins included)
 * beyond the cap, keeping the new one.
 *
 * @returns number of sessions removed
 */
export async function capLoginSessions(userId: string, keepSessionId: string): Promise<number> {
  return prisma.$executeRaw`
    DELETE FROM session
    WHERE sid IN (
      SELECT sid FROM session
      WHERE (sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId})
        AND sid <> ${keepSessionId}
      ORDER BY expire DESC
      OFFSET ${MAX_SESSIONS_PER_USER - 1}
    )
  `;
}
