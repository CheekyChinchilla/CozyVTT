import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { databaseConnectionSettings } from './prismaClient';
import logger from '../utils/logger';
import { rememberMeMaxAge } from './sessionDurations';
import { sessionOptions } from './sessionOptions';
import { sessionSecretProblem, sessionSecretWarning, INSECURE_SESSION_SECRETS } from './sessionSecret';

export { rememberMeMaxAge };

const PgSession = connectPgSimple(session);

// PostgreSQL connection pool for session storage. Exported so a clean
// shutdown can close it. Built from the settings the app's own connection
// uses (config/prismaClient.ts): pg ignores `?schema=` in DATABASE_URL, and a
// pool given the raw address kept sign-ins in public.session while the
// queries that end them (services/sessionStore.ts) read the named schema. The
// store names the schema too, and the pool is sized by `connection_limit`.
const databaseUrl = process.env.DATABASE_URL;
const { pool: poolSettings, schema: sessionSchema } = databaseUrl
  ? databaseConnectionSettings(databaseUrl)
  : { pool: {}, schema: 'public' };

export const sessionPool = new Pool(poolSettings);

// node-postgres emits 'error' on the pool when an idle connection drops, as
// every one does when PostgreSQL stops or restarts. An 'error' event with no
// listener is thrown and would end the process. The pool opens a new
// connection for the next query, so the drop is only logged.
sessionPool.on('error', (err) => {
  logger.error('Session store lost a database connection', { err });
});

// SESSION_SECRET signs the session cookie. A production server stops here on
// a value anyone could guess: unset, an example value the example files or
// the guides show, or one too short to have been generated. The list and the
// rule are in config/sessionSecret.ts, where a test holds the guides to them.
const SESSION_SECRET = process.env.SESSION_SECRET;
const secretProblem = sessionSecretProblem(SESSION_SECRET);

if (secretProblem) {
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      `[FATAL] SESSION_SECRET ${secretProblem}. ` +
        'Generate a strong secret with: openssl rand -hex 32'
    );
    process.exit(1);
  } else {
    logger.warn(sessionSecretWarning(secretProblem));
  }
}

// Session configuration: the behaviour and cookie in config/sessionOptions.ts,
// kept in PostgreSQL and signed with SESSION_SECRET.
export const sessionConfig: session.SessionOptions = {
  ...sessionOptions,
  store: new PgSession({
    pool: sessionPool,
    schemaName: sessionSchema,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET && !INSECURE_SESSION_SECRETS.includes(SESSION_SECRET)
    ? SESSION_SECRET
    : 'dev-only-insecure-secret-do-not-use-in-production',
};
