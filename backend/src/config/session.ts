import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import logger from '../utils/logger';

const PgSession = connectPgSimple(session);

// PostgreSQL connection pool for session storage
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Validate SESSION_SECRET — fail loudly in production rather than silently run insecure
const SESSION_SECRET = process.env.SESSION_SECRET;
const INSECURE_PLACEHOLDERS = [
  'CHANGE_ME_TO_RANDOM_STRING_32_CHARS_MIN',
  'development-secret-change-in-production',
  'CHANGE_ME_TO_RANDOM_STRING',
];

if (!SESSION_SECRET || INSECURE_PLACEHOLDERS.includes(SESSION_SECRET)) {
  if (process.env.NODE_ENV === 'production') {
    logger.error(
      '[FATAL] SESSION_SECRET is not set or is using a placeholder value. ' +
        'Generate a strong secret with: openssl rand -hex 32'
    );
    process.exit(1);
  } else {
    logger.warn(
      '[WARN] SESSION_SECRET is not configured — using an insecure development default. ' +
        'Set a real secret in backend/.env before deploying.'
    );
  }
}

// Session configuration
export const sessionConfig: session.SessionOptions = {
  store: new PgSession({
    pool: pgPool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET || 'dev-only-insecure-secret-do-not-use-in-production',
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
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '3600000'), // 1 hour of inactivity
  },
};

// Extended session duration for "Remember Me"
export const rememberMeMaxAge = parseInt(
  process.env.REMEMBER_ME_MAX_AGE || '2592000000' // 30 days default
);
