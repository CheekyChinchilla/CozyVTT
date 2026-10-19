import type { Request } from 'express';
import { failureLimiter } from './failureLimiter';
import { writeSystemLog } from '../services/systemLog';
import { MAX_EMAIL_LENGTH } from '../utils/validation';

/**
 * Limits shared by routes in more than one router. The per-address sign-in
 * limiters live with the sign-in routes in routes/auth.ts; these are also
 * needed by the users router, and the two per-account sign-in limits by the
 * admin router, which clears an account's sign-in lock.
 */

/**
 * The key the per-account sign-in limit counts an email under: trimmed and
 * lowercased, as the account table stores it, so the count cannot be dodged
 * with capitals or spaces. The routes that set a password pass the account's
 * email here to `accountLoginLimiter.forget`.
 */
export function accountLoginKey(email: string): string {
  return `account:${email.trim().toLowerCase()}`;
}

/**
 * The email a sign-in is for, as `accountLoginKey` counts it. Null when the
 * body has no usable email: the schema refuses such a request with 400 and
 * nothing counts.
 */
function signInEmailKey(req: Request): string | null {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null) return null;
  const email = (body as Record<string, unknown>).email;
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  if (normalised === '' || normalised.length > MAX_EMAIL_LENGTH) return null;
  return accountLoginKey(normalised);
}

/**
 * Wrong passwords per account, from every address: 10 in an hour, then that
 * email is refused with 429 until the oldest counted failure is an hour old.
 * The sign-in limiter in routes/auth.ts counts per address, so someone with
 * many addresses had as many guesses at one account as addresses, with
 * nothing to notice it. This one counts the account, and tells the admins
 * when it trips.
 *
 * Ten an hour is far more than a person mistyping their own password needs,
 * and a new password opens the account again at once: the routes that set
 * one (a reset by link, an administrator's temporary password, a change from
 * a signed-in device) forget the count, since the guesses were at the old
 * password. Without that, anyone who knew an email address could keep the
 * account locked with ten wrong passwords an hour. The count and the answer
 * are the same for an email with no account, so this cannot be used to find
 * out who has one.
 */
export const accountLoginLimiter = failureLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many failed sign-ins for this account, please try again later',
  key: signInEmailKey,
  onLimit: (req, key) => {
    const email = key.slice('account:'.length);
    void writeSystemLog({
      level: 'WARNING',
      message: `Sign-in locked for ${email}: 10 wrong passwords within an hour, the last from ${req.ip ?? 'an unknown address'}`,
      context: { email, address: req.ip ?? null },
    });
  },
});

/** The key the per-account code limit counts a pending sign-in under. */
export function mfaAccountKey(userId: string): string {
  return `mfa-account:${userId}`;
}

/**
 * The code step, per account: 5 wrong codes per 15 minutes for one account,
 * from wherever they come. The per-address code limiter in routes/auth.ts
 * counts per address, so someone who already has the password could
 * otherwise spread their guesses at the code across many addresses. Keyed on
 * the account the pending sign-in belongs to, which the password step put in
 * the session; a request with no sign-in pending is refused by the handler
 * and neither held nor counted here.
 */
export const mfaAccountLimiter = failureLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many MFA login attempts for this account, please try again later',
  key: (req) => (req.session?.mfaPendingUserId ? mfaAccountKey(req.session.mfaPendingUserId) : null),
});

/**
 * When an account's sign-in lock ends: the later of the lock for wrong
 * passwords and the lock for wrong codes, or null when neither holds. For the
 * Admin Panel's user list, which an admin alone may read.
 */
export function signInLockedUntil(account: { id: string; email: string }): Date | null {
  const ends = [
    accountLoginLimiter.peek(accountLoginKey(account.email)).lockedUntil,
    mfaAccountLimiter.peek(mfaAccountKey(account.id)).lockedUntil,
  ].filter((end): end is Date => end !== null);
  return ends.length === 0 ? null : new Date(Math.max(...ends.map((end) => end.getTime())));
}

/** Forget an account's wrong passwords and wrong codes, which opens its sign-in at once. */
export function clearSignInLock(account: { id: string; email: string }): void {
  accountLoginLimiter.forget(accountLoginKey(account.email));
  mfaAccountLimiter.forget(mfaAccountKey(account.id));
}

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
