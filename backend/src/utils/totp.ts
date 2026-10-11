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

import { generateSecret, generateURI, verifySync } from 'otplib';
import logger from './logger';

const STEP_SECONDS = 30;

/** One step either side of the current one, for clock drift. */
const WINDOW = 1;

/** What an authenticator app shows: six digits, nothing before, after or between them. */
const CODE = /^\d{6}$/;

const lastAcceptedStep = new Map<string, number>();

/**
 * A new secret: 20 random bytes, written in base32 as authenticator apps
 * read it. Secrets made before 1.5.2 were 20 printable characters in base32,
 * and they are read the same way.
 */
export function newTotpSecret(): string {
  return generateSecret({ length: 20 });
}

/** The otpauth:// address the setup QR code holds, which names the account as CozyVTT:<email>. */
export function totpSetupUri(secret: string, email: string): string {
  return generateURI({ issuer: 'CozyVTT', label: email, secret });
}

/**
 * Check a code against a user's secret, and record it as used if it passes.
 * Returns false for a wrong code, for anything that is not six digits, and
 * for a right one from a step at or before the last one this user had
 * accepted.
 */
export function verifyTotpOnce(userId: string, secret: string, token: string): boolean {
  if (!CODE.test(token)) return false;

  let match: ReturnType<typeof verifySync>;
  try {
    match = verifySync({
      secret,
      token,
      period: STEP_SECONDS,
      epoch: Math.floor(Date.now() / 1000),
      epochTolerance: WINDOW * STEP_SECONDS,
    });
  } catch (err) {
    // The code is six digits, so this is the stored secret: one that does
    // not read as base32, or is shorter than 16 bytes. No code can match it.
    logger.warn('A stored two-factor secret could not be read', { userId, reason: err instanceof Error ? err.message : String(err) });
    return false;
  }
  // A time-based match always names its step; the counter-based kind, which
  // this never asks for, does not.
  if (!match.valid || !('timeStep' in match)) return false;

  const step = match.timeStep;
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
