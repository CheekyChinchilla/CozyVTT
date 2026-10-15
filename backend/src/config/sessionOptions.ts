import type session from 'express-session';
import { sessionMaxAge } from './sessionDurations';

/**
 * How a sign-in's session behaves and what its cookie says: everything about
 * it except where it is kept and what signs it, which config/session.ts adds.
 * Kept apart so the integration tests' app runs with the same cookie as the
 * server without opening the server's database pool or checking its secret.
 */
export const sessionOptions = {
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
} satisfies Omit<session.SessionOptions, 'secret' | 'store'>;
