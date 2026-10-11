import type { Request } from 'express';
import { failureLimiter } from './failureLimiter';

/**
 * Limits shared by routes in more than one router. The sign-in limiters live
 * with the sign-in routes in routes/auth.ts; this one is also needed by the
 * users router.
 */

/**
 * Password checks made from a signed-in session: changing the password,
 * deleting the account, changing one's own email address. Each asks for the
 * current password, and a wrong one counted only against the general request
 * limit, so a stolen session could guess the password through them. One
 * allowance of 10 wrong passwords per 15 minutes for the account, from every
 * address; a correct password never counts, and nor does a request that asks
 * for no password (a profile edit), which is not held to it either.
 *
 * Ten is many times what a person mistyping their own password needs, and a
 * quarter of an hour's wait is what the sign-in limit asks of them too.
 */
export const passwordCheckLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many wrong passwords, please try again later',
  key: (req: Request) => {
    if (!req.session?.userId) return null;
    const body: unknown = req.body;
    const asks = typeof body === 'object' && body !== null
      && ['password', 'currentPassword'].some((field) => typeof (body as Record<string, unknown>)[field] === 'string');
    return asks ? `password-check:${req.session.userId}` : null;
  },
});
