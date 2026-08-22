import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import logger from '../utils/logger';

/**
 * Forced Password Change Middleware
 *
 * Accounts an admin created — and accounts whose password an admin reset — are
 * flagged with `mustChangePassword`. Until that password is replaced, the
 * session may do exactly one thing: replace it. Without this gate, the
 * temporary password the admin generated (and saw) keeps working indefinitely.
 *
 * Mounted on /api after the session middleware. Unauthenticated requests pass
 * straight through — the regular auth guards handle those.
 */

/** Machine-readable code so the frontend can redirect instead of guessing. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Paths that stay reachable while a password change is pending.
 * Relative to the /api mount point.
 */
const ALLOWED_PATHS = new Set([
  '/auth/change-password', // the one thing a gated session may do
  '/auth/logout',
  '/auth/me',
  '/auth/ping',
  '/auth/appearance',
  '/config',
]);

/**
 * Resolve the flag for the current session.
 *
 * The session copy is authoritative and costs nothing. Sessions created before
 * this field existed hold `undefined`, so fall back to a single database read
 * and cache the answer — existing logins keep working across the upgrade rather
 * than being force-logged-out.
 */
async function isPasswordChangePending(req: Request): Promise<boolean> {
  if (typeof req.session.mustChangePassword === 'boolean') {
    return req.session.mustChangePassword;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      select: { mustChangePassword: true },
    });

    // No user behind this session — let the auth guards deal with it
    if (!user) return false;

    req.session.mustChangePassword = user.mustChangePassword;
    return user.mustChangePassword;
  } catch (error) {
    // Never lock everyone out of the app over a transient database error
    logger.error('Error checking password-change status', { err: error });
    return false;
  }
}

export async function requirePasswordChanged(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.session?.userId) {
    return next();
  }

  if (ALLOWED_PATHS.has(req.path)) {
    return next();
  }

  if (await isPasswordChangePending(req)) {
    res.status(403).json({
      error: 'Password Change Required',
      code: PASSWORD_CHANGE_REQUIRED,
      message: 'You must set a new password before continuing.',
    });
    return;
  }

  next();
}
