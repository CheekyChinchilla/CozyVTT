import type { Request } from 'express';

/**
 * Issue a fresh session id, discarding the old one.
 *
 * Called whenever a session moves to a more-privileged state — signing in,
 * completing MFA, registering — so the identifier a request carried before it
 * was authenticated cannot become an authenticated one. `express-session`
 * writes the new fields to a new row; the caller sets them after this resolves.
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}
