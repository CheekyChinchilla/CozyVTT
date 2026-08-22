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
 * End every login session belonging to a user.
 *
 * Used when an admin resets someone's password: without this the target keeps
 * browsing on their existing session, and the forced-password-change gate would
 * only apply the next time they log in.
 *
 * @returns number of sessions removed
 */
export async function destroyUserLoginSessions(userId: string): Promise<number> {
  try {
    const removed = await prisma.$executeRaw`
      DELETE FROM session WHERE sess->>'userId' = ${userId}
    `;
    return removed;
  } catch (error) {
    // Best-effort: the password has already been changed, so a failure here
    // must not fail the request that triggered it
    logger.error('Failed to clear login sessions for user', { err: error, userId });
    return 0;
  }
}
