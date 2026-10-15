import { Request, Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';
import { sessionIsSignedIn, notSignedInMessage, sessionHasAgedOut, agedOutMessage } from '../services/signedIn';

/**
 * The three guards share one idea of "signed in" (services/signedIn): a user
 * id with no two-factor step left to finish. requireAdmin and requireRole used
 * to check the user id alone, so they rested on always being paired with
 * requireAuth; each now refuses a pending session by itself.
 */

/** The code on the 401 for a sign-in older than the remember-me window. */
export const SIGN_IN_EXPIRED = 'SIGN_IN_EXPIRED';

/**
 * For a session that is signed in: 401, ending the session, once the sign-in
 * is older than the remember-me window; true when the request may go on. The
 * guards below ask it, and so does GET /api/auth/me, which answers a session
 * that is not signed in by itself.
 */
export function withinSignInLimitOr401(req: Request, res: Response): boolean {
  // A sign-in ends REMEMBER_ME_MAX_AGE after it was made, however active.
  // One from before the field existed is stamped now, so an upgrade signs
  // nobody out; it then has the full window from here.
  if (req.session.signedInAt === undefined) {
    req.session.signedInAt = Date.now();
  } else if (sessionHasAgedOut(req.session)) {
    // The code lets the pages carry the sentence to the sign-in page.
    req.session.destroy(() => {
      res.status(401).json({ error: 'Unauthorized', code: SIGN_IN_EXPIRED, message: agedOutMessage() });
    });
    return false;
  }
  return true;
}

/** 401 unless the session is signed in; true when the guard may go on. */
function signedInOr401(req: Request, res: Response): boolean {
  if (!sessionIsSignedIn(req.session)) {
    res.status(401).json({ error: 'Unauthorized', message: notSignedInMessage(req.session) });
    return false;
  }
  return withinSignInLimitOr401(req, res);
}

/**
 * Require user to be authenticated.
 * Rejects sessions that are mid-MFA-flow (mfaPending).
 * Returns 401 if not logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!signedInOr401(req, res)) return;
  return next();
}

/**
 * Require user to be a platform admin.
 * Returns 401 if not logged in, 403 if not admin.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!signedInOr401(req, res)) return;

  if (req.session.platformRole !== 'ADMIN') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    });
  }

  return next();
}

/**
 * Require specific platform role
 */
export function requireRole(role: PlatformRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!signedInOr401(req, res)) return;

    if (req.session.platformRole !== role) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This resource requires ${role} role`,
      });
    }

    return next();
  };
}

/**
 * Optional authentication — does not block unauthenticated requests.
 * Session data is already available via express-session for routes that
 * choose to use it without enforcing authentication.
 */
export function optionalAuth(_req: Request, _res: Response, next: NextFunction) {
  return next();
}
