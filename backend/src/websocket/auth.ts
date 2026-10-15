import { Socket } from 'socket.io';
import type { SessionData, Store } from 'express-session';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { sessionIsSignedIn, sessionHasAgedOut } from '../services/signedIn';
import { pastAdminMfaDeadline } from '../services/adminMfaPolicy';

/**
 * WebSocket Authentication Middleware
 * Connection & Authentication
 *
 * Every WebSocket connection is authenticated against the Express session store
 * before any campaign events are processed.
 */

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  campaignId?: string;
  role?: string;
  /** The login session this socket was opened under, so ending that sign-in can end the socket. */
  sessionId?: string;
  /** The `authenticate` in progress, so the next one on this socket waits for it (events.ts). */
  authenticating?: Promise<void>;
  /**
   * On a DM's socket, the player whose explored memory its Player Preview is
   * showing, as its last `exploration:request` named them: the one other
   * member's memory it is sent as it grows.
   */
  previewingMemoryOf?: string;
}

/**
 * The fields authentication sets on a socket. `fetchSockets()` hands back a
 * RemoteSocket, whose type does not know about them; with the default
 * in-memory adapter the objects are the sockets themselves, so the fields are
 * there to read and write. Casting to this, not to a literal of its own,
 * keeps the fields declared once.
 */
export type AuthenticatedFields = Pick<AuthenticatedSocket, 'userId' | 'campaignId' | 'role' | 'sessionId'>;

/**
 * Whether the account has to set up two-factor authentication before it may
 * use the live table: an administrator past the deadline, whom the REST gate
 * (middleware/adminMfa) refuses almost everything. Logged as the
 * password-change refusal is.
 */
async function mustSetUpMfaFirst(user: Parameters<typeof pastAdminMfaDeadline>[0]): Promise<boolean> {
  if (!(await pastAdminMfaDeadline(user))) return false;
  logger.warn('WebSocket rejected: two-factor authentication required', { userId: user.id });
  return true;
}

/**
 * Whether the sign-in this socket was opened under still exists in the session
 * store and is still this user's. The handshake checks the session once; a
 * sign-in that ends later (signing out, expiry, a password change elsewhere)
 * leaves the socket open, and `authenticate` asks this before letting it join
 * a campaign. Read through the socket's own session store, the one the
 * handshake used, so a store error counts as ended.
 *
 * The two-factor deadline passes with time, so a socket opened within an
 * administrator's 7 days is stopped here once they are over. A database
 * error while the deadline is checked lets the socket through, as the REST
 * gate lets the request through.
 */
export async function socketSessionIsLive(socket: AuthenticatedSocket): Promise<boolean> {
  const { sessionStore } = socket.request as { sessionStore?: Store };
  const sessionId = socket.sessionId;
  const userId = socket.userId;
  if (!sessionStore || !sessionId || !userId) return false;
  const stored = await new Promise<Partial<SessionData> | null>((resolve) => {
    sessionStore.get(sessionId, (err, found) => resolve(err ? null : (found ?? null)));
  });
  if (!sessionIsSignedIn(stored) || sessionHasAgedOut(stored) || stored.userId !== userId) return false;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, mfaEnabled: true, createdAt: true },
    });
    return !(user && (await mustSetUpMfaFirst(user)));
  } catch (error) {
    logger.error('Error checking the administrator two-factor policy', { err: error });
    return true;
  }
}

/**
 * Authenticate an incoming WebSocket connection via the shared Express session.
 * Attaches userId to the socket on success.
 */
export async function authenticateSocket(socket: AuthenticatedSocket): Promise<boolean> {
  try {
    // express-session attaches `session` to the underlying request, but the
    // socket.io type for `socket.request` is the bare Node IncomingMessage and
    // knows nothing about it.
    //
    // Borrowing the real `SessionData` rather than re-declaring the field:
    // a local `{ userId?: string }` would keep compiling if that field were
    // renamed, and this socket would then silently reject every connection
    // while the REST routes failed loudly at build time.
    const { session, sessionID } = socket.request as { session?: Partial<SessionData>; sessionID?: string };

    // The same question the REST guards ask (services/signedIn): a session
    // still at the two-factor step is not signed in, user id or not.
    if (!sessionIsSignedIn(session) || sessionHasAgedOut(session)) {
      return false;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, mustChangePassword: true, platformRole: true, mfaEnabled: true, createdAt: true },
    });

    if (!user) {
      return false;
    }

    // Same gates the REST API applies: an account that still has to replace
    // an admin-issued password cannot play over the socket either, nor an
    // administrator past the two-factor deadline.
    if (user.mustChangePassword) {
      logger.warn('WebSocket rejected: password change required', { userId: user.id });
      return false;
    }
    if (await mustSetUpMfaFirst(user)) {
      return false;
    }

    socket.userId = user.id;
    socket.sessionId = sessionID;
    return true;
  } catch (error) {
    logger.error('WebSocket authentication error', { err: error });
    return false;
  }
}

/**
 * Check that the socket's user belongs to the campaign, and report their role.
 *
 * Reports only. The `authenticate` handler owns the socket's campaign and role
 * fields, because it has to leave the previous campaign's room first, and it
 * can only know which room that was if nothing has overwritten the id yet.
 */
export async function authenticateCampaign(
  socket: AuthenticatedSocket,
  campaignId: string
): Promise<{ success: boolean; role?: string; error?: string }> {
  try {
    if (!socket.userId) {
      return { success: false, error: 'Socket not authenticated' };
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, status: true },
    });

    if (!campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    // Verify user is a member of the campaign
    const membership = await prisma.campaignMembership.findUnique({
      where: {
        userId_campaignId: {
          userId: socket.userId,
          campaignId,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      return { success: false, error: 'You are not a member of this campaign' };
    }

    return {
      success: true,
      role: membership.role,
    };
  } catch (error) {
    logger.error('WebSocket campaign authentication error', { err: error });
    return { success: false, error: 'Internal server error' };
  }
}
