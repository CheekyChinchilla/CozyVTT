/**
 * Refuse to run a production instance on the placeholder database password.
 *
 * `.env.example` ships `DATABASE_PASSWORD=CHANGE_ME_TO_SECURE_PASSWORD`, and
 * both services use it as-is. Nothing refused to boot on it, while the same
 * mistake with SESSION_SECRET has always been fatal in production. Postgres is
 * not published to the host in the shipped compose file, so this is defence in
 * depth, but it is exactly the "self-hoster forgets a secret and it still runs"
 * case the threat model names.
 */

import logger from '../utils/logger';

/** The passwords the templates ship with. */
const PLACEHOLDER_PASSWORDS = ['CHANGE_ME_TO_SECURE_PASSWORD', 'CHANGE_ME'];

/** Why a database URL should not be used, or null when it is fine. */
export function databaseCredentialProblem(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return 'DATABASE_URL is not set';
  let password: string;
  try {
    password = decodeURIComponent(new URL(databaseUrl).password);
  } catch {
    return 'DATABASE_URL is not a valid connection string';
  }
  if (PLACEHOLDER_PASSWORDS.includes(password)) {
    return 'DATABASE_URL uses the placeholder password from .env.example';
  }
  return null;
}

/**
 * The database user and name a URL connects as, for the commands the refusal
 * prints: DATABASE_USER and DATABASE_NAME may have been changed in .env. The
 * shipped defaults when the URL names neither, or cannot be read.
 */
function connectionNames(databaseUrl: string | undefined): { user: string; database: string } {
  try {
    const url = new URL(databaseUrl ?? '');
    return {
      user: decodeURIComponent(url.username) || 'cozyvtt',
      database: decodeURIComponent(url.pathname.slice(1)) || 'cozyvtt',
    };
  } catch {
    return { user: 'cozyvtt', database: 'cozyvtt' };
  }
}

/**
 * Called once at startup. Production exits; anything else warns, so a
 * developer's throwaway database keeps working.
 */
export function enforceDatabaseCredential(
  env: Record<string, string | undefined> = process.env,
  exit: (code: number) => void = (code) => process.exit(code)
): void {
  const problem = databaseCredentialProblem(env.DATABASE_URL);
  if (!problem) return;
  if (env.NODE_ENV === 'production') {
    // An instance that has already run keeps the password its database was
    // created with, whatever .env says, so the order of the steps matters.
    const { user, database } = connectionNames(env.DATABASE_URL);
    logger.error(
      `[FATAL] ${problem}. On Docker, change it inside the database first: ` +
        `docker compose exec database psql -U ${user} -d ${database} -c "ALTER USER ${user} WITH PASSWORD '<new>';" ` +
        '(openssl rand -hex 24 makes a good one), then set DATABASE_PASSWORD in .env to the same value, ' +
        'update DATABASE_URL too if you wrote it by hand, and run docker compose up -d. ' +
        'See docs/DEPLOYMENT.md, "Changing the database password".'
    );
    exit(1);
    return;
  }
  logger.warn(`[WARN] ${problem}. Fine for development; a production instance refuses to start like this.`);
}
