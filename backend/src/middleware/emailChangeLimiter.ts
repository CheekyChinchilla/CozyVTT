/**
 * How many times one account may try to change its own email address.
 *
 * The route answers "Email already in use" to a taken address once the
 * current password is confirmed. A correct password is never counted against
 * the password-check limit, so a signed-in user who knows their own password
 * could otherwise try address after address, at the general request limit,
 * and learn which ones have accounts on an instance whose registration is
 * closed.
 *
 * Every attempt to change one's own address counts: right password or wrong,
 * taken address or free, missing password, and a change that is made. Keyed
 * by the signed-in account, so a second sign-in or another address shares the
 * same allowance. A profile edit that leaves the address as it is does not
 * count and is not held. An admin changing someone else's address is not
 * capped: they give no password, and the admin log records the change.
 *
 * Five an hour lets a person fix a typo or two and change their mind, and
 * leaves a probe five addresses an hour where it had thousands. A refusal is
 * not counted, so the cap opens an hour after the oldest counted attempt.
 * Like the per-account sign-in limit, it sends no rate-limit headers.
 *
 * Kept in memory, like the other limiters: a restart forgets it.
 */

export const EMAIL_CHANGES_PER_HOUR = 5;
export const EMAIL_CHANGE_WINDOW_MS = 60 * 60 * 1000;

/** The refusal's message, sent as `{ error: 'Rate Limited', message }` with Retry-After. */
export const EMAIL_CHANGE_LIMIT_MESSAGE =
  `You have tried to change your email address ${EMAIL_CHANGES_PER_HOUR} times in the last hour, the most this server allows. Please try again later.`;

export type EmailChangeTurn =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** When each counted attempt was made, oldest first, per account. */
const attempts = new Map<string, number[]>();

function withinWindow(times: number[], now: number): number[] {
  return times.filter((at) => now - at < EMAIL_CHANGE_WINDOW_MS);
}

/**
 * Take one attempt at changing `userId`'s own address. Refused, nothing is
 * counted and the answer says how long until the oldest attempt ages out.
 * The check and the count happen together, so attempts sent at once cannot
 * all pass under the cap.
 */
export function takeEmailChangeTurn(userId: string): EmailChangeTurn {
  const now = Date.now();
  const recent = withinWindow(attempts.get(userId) ?? [], now);
  if (recent.length >= EMAIL_CHANGES_PER_HOUR) {
    attempts.set(userId, recent);
    const opensAt = recent[0] + EMAIL_CHANGE_WINDOW_MS;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((opensAt - now) / 1000)) };
  }
  recent.push(now);
  attempts.set(userId, recent);
  return { allowed: true };
}

// Accounts whose attempts have all aged out are dropped as they are next
// seen; this catches the ones that are not seen again.
setInterval(() => {
  const now = Date.now();
  for (const [userId, times] of attempts) {
    const recent = withinWindow(times, now);
    if (recent.length === 0) attempts.delete(userId);
    else attempts.set(userId, recent);
  }
}, 60 * 1000).unref();
