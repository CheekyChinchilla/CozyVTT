/**
 * Authenticator (TOTP) codes, accepted once each.
 *
 * A code is valid for its own 30-second step and, for clock drift, one step
 * either side, so up to a minute and a half. Anyone who sees a code used (over
 * a shoulder, in a proxy log, through a phishing page that forwards it) could
 * otherwise sign in with it again in that time. So each account's last
 * accepted step is remembered, and a code from that step or an earlier one is
 * refused.
 *
 * The record is kept in this process's memory. That is enough for CozyVTT as
 * deployed, a single backend process: every check goes through this map, and
 * Node runs the check and the record with no await in between, so two requests
 * carrying one code cannot both pass. A restart forgets the record, which
 * reopens at most the minute and a half a code already used before the restart
 * stays valid. Running more than one backend process would need the step kept
 * in the database, which is a schema change.
 */

import speakeasy from 'speakeasy';

const STEP_SECONDS = 30;

/** One step either side of the current one, for clock drift. */
const WINDOW = 1;

const lastAcceptedStep = new Map<string, number>();

/**
 * Check a code against a user's secret, and record it as used if it passes.
 * Returns false for a wrong code, and for a right one from a step at or before
 * the last one this user had accepted.
 */
export function verifyTotpOnce(userId: string, secret: string, token: string): boolean {
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const match = speakeasy.totp.verifyDelta({
    secret,
    encoding: 'base32',
    token,
    window: WINDOW,
    counter,
  });
  if (!match) return false;

  const step = counter + match.delta;
  const last = lastAcceptedStep.get(userId);
  if (last !== undefined && step <= last) return false;

  lastAcceptedStep.set(userId, step);
  return true;
}

/**
 * Forget a user's record, when their secret is replaced or removed. Codes from
 * a new secret have nothing to do with the old one's steps.
 */
export function forgetTotpSteps(userId: string): void {
  lastAcceptedStep.delete(userId);
}
