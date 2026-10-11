import { prisma } from '../config/database';
import logger from '../utils/logger';

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
 * change, and when their account is deleted: the guards read the role from the
 * session and nothing re-reads it, so without this the person keeps whatever
 * they had until they happen to sign out.
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
  exceptSessionId?: string
): Promise<number> {
  try {
    const removed = exceptSessionId
      ? await prisma.$executeRaw`
          DELETE FROM session
          WHERE (sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId})
            AND sid <> ${exceptSessionId}
        `
      : await prisma.$executeRaw`
          DELETE FROM session
          WHERE sess->>'userId' = ${userId} OR sess->>'mfaPendingUserId' = ${userId}
        `;
    return removed;
  } catch (error) {
    // Best-effort: the password has already been changed, so a failure here
    // must not fail the request that triggered it
    logger.error('Failed to clear login sessions for user', { err: error, userId });
    return 0;
  }
}
