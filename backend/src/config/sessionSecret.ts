/**
 * Whether SESSION_SECRET could be guessed. A production server stops on one
 * that could (config/session.ts): unset, an example value the repository
 * shows, or too short to have been generated.
 *
 * Kept apart from config/session.ts, which opens the database pool when it
 * is loaded, so the check that every example the guides show is refused can
 * import it (src/__tests__/keepInStep.test.ts). The guide's example was once
 * changed without the list below, and the new example line was accepted.
 */

/**
 * Every value the example files and the guides show, or used to show, for
 * SESSION_SECRET. Each is refused in production: a self-hoster who copies a
 * block as written is told to generate a secret instead of running on a
 * publicly known one.
 */
export const INSECURE_SESSION_SECRETS: readonly string[] = [
  'CHANGE_ME_TO_RANDOM_STRING_32_CHARS_MIN',
  'development-secret-change-in-production',
  'CHANGE_ME_TO_RANDOM_STRING',
  'your-64-char-random-string',
  '<paste the 64 characters that command prints>',
  'dev-session-secret-change-in-production-please',
];

/** `openssl rand -hex 32`, which the guides give, produces 64 characters. */
export const MIN_SESSION_SECRET_LENGTH = 32;

/** Why a secret is refused, as a clause after "SESSION_SECRET", or null when it is accepted. */
export function sessionSecretProblem(secret: string | undefined): string | null {
  if (!secret) return 'is not set';
  if (INSECURE_SESSION_SECRETS.includes(secret)) return 'is a placeholder value';
  if (secret.length < MIN_SESSION_SECRET_LENGTH) return `is shorter than ${MIN_SESSION_SECRET_LENGTH} characters`;
  return null;
}
