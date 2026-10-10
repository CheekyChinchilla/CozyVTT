import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import logger from '../utils/logger';
import { sessionMaxAge, rememberMeMaxAge } from './sessionDurations';

export { rememberMeMaxAge };

const PgSession = connectPgSimple(session);

// PostgreSQL connection pool for session storage. Exported so a clean
// shutdown can close it.
export const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// node-postgres emits 'error' on the pool when an idle connection drops, as
// every one does when PostgreSQL stops or restarts. An 'error' event with no
// listener is thrown and would end the process. The pool opens a new
// connection for the next query, so the drop is only logged.
sessionPool.on('error', (err) => {
  logger.error('Session store lost a database connection', { err });
});

// SESSION_SECRET signs the session cookie. A production server stops here on
// a value anyone could guess: unset, one of the placeholders the example files
// and the deployment guide show, or one too short to have been generated.
const SESSION_SECRET = process.env.SESSION_SECRET;
const INSECURE_PLACEHOLDERS = [
  'CHANGE_ME_TO_RANDOM_STRING_32_CHARS_MIN',
  'development-secret-change-in-production',
  'CHANGE_ME_TO_RANDOM_STRING',
  'your-64-char-random-string',
];
/** `openssl rand -hex 32`, which the guides give, produces 64 characters. */
const MIN_SESSION_SECRET_LENGTH = 32;

const secretProblem = !SESSION_SECRET
  ? 'is not set'
  : INSECURE_PLACEHOLDERS.includes(SESSION_SECRET)
    ? 'is a placeholder value'
    : SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH
      ? `is shorter than ${MIN_SESSION_SECRET_LENGTH} characters`
      : null;

if (secretProblem) {
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      `[FATAL] SESSION_SECRET ${secretProblem}. ` +
        'Generate a strong secret with: openssl rand -hex 32'
    );
    process.exit(1);
  } else {
    logger.warn(
      `[WARN] SESSION_SECRET ${secretProblem}. ` +
        'Set a real secret in backend/.env before deploying; generate one with: openssl rand -hex 32'
    );
  }
}

// Session configuration
export const sessionConfig: session.SessionOptions = {
  store: new PgSession({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET && !INSECURE_PLACEHOLDERS.includes(SESSION_SECRET)
    ? SESSION_SECRET
    : 'dev-only-insecure-secret-do-not-use-in-production',
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset maxAge on every response — session only expires after inactivity
  name: 'cozyvtt.sid',
  cookie: {
    httpOnly: true,  // Prevents JavaScript access (XSS protection)
    secure: 'auto',  // Sets Secure flag when connection is HTTPS (respects trust proxy +
                     // X-Forwarded-Proto), omits it on HTTP so localhost and plain HTTP
                     // deployments work without cookie being silently dropped
    sameSite: 'lax', // Allows cookie on same-site requests and top-level GET navigations
                     // from external links (email, Discord, etc.). 'strict' would redirect
                     // logged-in users to login whenever they follow any external link.
    maxAge: sessionMaxAge, // 1 hour of inactivity unless SESSION_MAX_AGE says otherwise
  },
};
