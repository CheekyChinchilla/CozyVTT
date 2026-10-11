import { Request, Response, NextFunction } from 'express';
import { setupState } from '../services/systemSettings';
import logger from '../utils/logger';

/**
 * The setup gate: until the one-time setup wizard has run, every route is
 * refused except the wizard's own (/api/setup and what lies under it) and the
 * health check.
 *
 * Setup never goes back once it has run, so the gate asks the database only
 * until it hears that it is complete. It runs ahead of the general rate
 * limiter, and asking on every request cost a query for each one, a request
 * the limiter then refused included. A restore replaces the database with
 * one that may never have been set up, so it calls forgetSetupComplete.
 */

let setupKnownComplete = false;

/** Ask the database again on the next request; for a restore. */
export function forgetSetupComplete(): void {
  setupKnownComplete = false;
}

/** The wizard's routes. A path that merely starts with these letters is not one. */
function isSetupRoute(path: string): boolean {
  return path === '/api/setup' || path.startsWith('/api/setup/');
}

/**
 * Check if setup is completed
 * If not, return 403 with setup required message
 */
export async function requireSetupComplete(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (setupKnownComplete || isSetupRoute(req.path) || req.path === '/health') {
    return next();
  }

  try {
    // setupState also finishes a setup an older version left with its
    // administrator created but unmarked, so that administrator can sign in.
    const { setupCompleted } = await setupState();

    if (!setupCompleted) {
      return res.status(403).json({
        error: 'Setup Required',
        message: 'System setup must be completed before accessing this resource',
        setupUrl: '/api/setup/status',
      });
    }

    setupKnownComplete = true;
    next();
  } catch (error) {
    logger.error('Error checking setup status', { err: error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify setup status',
    });
  }
}
