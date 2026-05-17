import { Request, Response, NextFunction } from 'express';
import { PlatformRole } from '@prisma/client';

/**
 * Require user to be authenticated.
 * Rejects sessions that are mid-MFA-flow (mfaPending).
 * Returns 401 if not logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.mfaPending) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'MFA verification required. Please complete MFA login.',
    });
  }

  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'You must be logged in to access this resource',
    });
  }

  return next();
}

/**
 * Require user to be a platform admin.
 * Returns 401 if not logged in, 403 if not admin.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'You must be logged in to access this resource',
    });
  }

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
    if (!req.session.userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to access this resource',
      });
    }

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
