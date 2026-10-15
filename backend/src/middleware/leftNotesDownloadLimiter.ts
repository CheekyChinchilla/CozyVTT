/**
 * How many times one user may ask for all the notes of a campaign they have
 * left (GET /api/campaigns/left/:campaignId/notes).
 *
 * One answer can carry 200 notes of 100,000 characters, tens of megabytes read
 * from the database, and any signed-in user can fill their notes to that. The
 * download button makes one request a campaign, so 60 an hour is many times
 * what a person with a shelf of old campaigns needs, and well below what a
 * script repeating the request would take from the database.
 */

import rateLimit, { ipKeyGenerator, type RateLimitInfo } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './rbac';

export const LEFT_NOTES_DOWNLOADS_PER_HOUR = 60;
const HOUR_MS = 60 * 60 * 1000;

export const leftNotesDownloadLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: LEFT_NOTES_DOWNLOADS_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `left-notes:${(req as AuthenticatedRequest).session?.userId ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous')}`,
  handler: (req: Request, res: Response) => {
    const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
    const minutes = info?.resetTime ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 60_000)) : 60;
    res.status(429).json({
      error: 'Too Many Requests',
      message:
        `You have downloaded your notes ${LEFT_NOTES_DOWNLOADS_PER_HOUR} times in the last hour, the most this server allows. ` +
        `Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  },
});
