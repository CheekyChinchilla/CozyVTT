import crypto from 'crypto';

/**
 * The one-time token the setup wizard asks for.
 *
 * Until setup has run, POST /api/setup/init makes whoever calls it the
 * administrator, and a fresh instance is often reachable from the internet
 * before its owner opens the wizard. So the route asks for a token only the
 * owner can read: SETUP_TOKEN when they set one in .env, otherwise a random
 * value made at first use, which server.ts prints in the log at start while
 * setup is incomplete. Nothing else reads it, and it has no further use once
 * setup has run.
 */

let generated: string | null = null;

/** The token in force: SETUP_TOKEN, trimmed, when set and not blank; otherwise this process's generated one. */
export function setupToken(): string {
  const configured = process.env.SETUP_TOKEN?.trim();
  if (configured) return configured;
  if (generated === null) generated = crypto.randomBytes(16).toString('hex');
  return generated;
}

/** Whether a value sent by the wizard is the token, compared in constant time. */
export function setupTokenMatches(given: unknown): boolean {
  if (typeof given !== 'string' || given === '') return false;
  const expected = Buffer.from(setupToken(), 'utf8');
  const got = Buffer.from(given, 'utf8');
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}
