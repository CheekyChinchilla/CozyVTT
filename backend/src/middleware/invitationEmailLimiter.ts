/**
 * How many campaign invitation emails one DM may have the instance send.
 *
 * Each one goes out from the instance's own mail account and carries a
 * campaign name and description the DM wrote, and any signed-in user can be
 * the DM of a campaign of their own. Without a ceiling, one account could use
 * the instance to mail every other account, over and over, and burn the
 * self-hoster's mail account.
 *
 * A DM inviting a table of four to six players sends a handful; 20 an hour is
 * several tables at once. The invitation itself is never limited here: only a
 * request that asks for an email, on a server that can send one, counts, and
 * one the route refuses (already a member, already invited) sends nothing and
 * is not counted. Past the ceiling the DM can still invite without the email.
 */

import rateLimit, { type RateLimitInfo } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './rbac';
import { isSmtpConfigured } from '../services/email';

export const INVITATION_EMAILS_PER_HOUR = 20;
const HOUR_MS = 60 * 60 * 1000;

/** Whether this invitation asks the instance to send an email. */
function asksForEmail(req: Request): boolean {
  const body: unknown = req.body;
  return typeof body === 'object' && body !== null && (body as { sendEmail?: unknown }).sendEmail === true;
}

export const invitationEmailLimiter = rateLimit({
  windowMs: HOUR_MS,
  limit: INVITATION_EMAILS_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `invitation-email:${(req as AuthenticatedRequest).session?.userId ?? req.ip ?? 'anonymous'}`,
  skip: (req: Request) => !asksForEmail(req) || !isSmtpConfigured(),
  skipFailedRequests: true,
  handler: (req: Request, res: Response) => {
    const info = (req as Request & { rateLimit?: RateLimitInfo }).rateLimit;
    const minutes = info?.resetTime ? Math.max(1, Math.ceil((info.resetTime.getTime() - Date.now()) / 60_000)) : 60;
    res.status(429).json({
      error: 'Too Many Requests',
      message:
        `You have sent ${INVITATION_EMAILS_PER_HOUR} invitation emails in the last hour, the most this server allows. ` +
        `Send this invitation without the email, or try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  },
});
