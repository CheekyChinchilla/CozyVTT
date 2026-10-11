import type { Request, Response, NextFunction } from 'express';
import { databaseBeingReplaced, RESTORING_MESSAGE } from '../services/restoreState';

/**
 * While a restore replaces the database, every API request is refused with
 * 503 before it touches the database (services/restoreState.ts). Mounted
 * ahead of the session middleware, whose session lookup would otherwise wait
 * behind the load.
 */
export function refuseWhileDatabaseIsReplaced(_req: Request, res: Response, next: NextFunction): void {
  if (!databaseBeingReplaced()) {
    next();
    return;
  }
  res.status(503).set('Retry-After', '60').json({ error: 'Service Unavailable', message: RESTORING_MESSAGE });
}
