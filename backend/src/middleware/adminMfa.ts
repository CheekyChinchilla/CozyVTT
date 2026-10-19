import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../utils/logger';
import { pastAdminMfaDeadline } from '../services/adminMfaPolicy';
import { sessionIsSignedIn } from '../services/signedIn';
import { PASSWORD_GATE_ALLOWED_PATHS } from './passwordChange';

/**
 * Administrator accounts must use two-factor authentication.
 *
 * For a signed-in administrator, every request reads the account once: an
 * administrator without MFA whose deadline (services/adminMfaPolicy) has
 * passed may do nothing but enrol, sign out, or the few things the password
 * gate allows too. Ordinary users are not read, so they pay nothing. The
 * live connection asks the same question (websocket/auth), so such an
 * administrator cannot play at a table either.
 *
 * The read also refreshes the session's copy of the role, which nothing else
 * re-reads: an administrator demoted while signed in loses the admin guards
 * on their next request even if ending their sessions failed, and a session
 * whose account is gone ends here.
 *
 * Mounted on /api after the password-change gate, which runs first so an
 * admin-issued password is replaced before anything else is asked.
 */

/** Machine-readable code so the frontend can send the admin to enrolment. */
export const MFA_ENROLMENT_REQUIRED = 'MFA_ENROLMENT_REQUIRED';

/**
 * Paths that stay reachable past the deadline, relative to the /api mount
 * point: the two steps of enrolment, and what the password gate allows.
 */
const ALLOWED_PATHS: ReadonlySet<string> = new Set([
  '/auth/mfa/setup',
  '/auth/mfa/verify',
  ...PASSWORD_GATE_ALLOWED_PATHS,
]);

export async function requireAdminMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!sessionIsSignedIn(req.session) || req.session.platformRole !== 'ADMIN') {
    return next();
  }

  let user: { id: string; platformRole: 'ADMIN' | 'USER'; mfaEnabled: boolean; createdAt: Date } | null;
  try {
    user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { id: true, platformRole: true, mfaEnabled: true, createdAt: true },
    });
  } catch (error) {
    // Never lock every administrator out over a transient database error.
    logger.error('Error checking the administrator two-factor policy', { err: error });
    return next();
  }

  if (!user) {
    req.session.destroy(() => {
      res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    });
    return;
  }

  // The session said ADMIN; the account is what counts.
  if (user.platformRole !== 'ADMIN') {
    req.session.platformRole = user.platformRole;
    return next();
  }

  if (ALLOWED_PATHS.has(req.path)) {
    return next();
  }

  if (await pastAdminMfaDeadline(user)) {
    res.status(403).json({
      error: 'MFA Required',
      code: MFA_ENROLMENT_REQUIRED,
      message: 'Administrator accounts must use two-factor authentication. Set it up to continue.',
    });
    return;
  }

  next();
}
