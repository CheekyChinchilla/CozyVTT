import type { SessionData } from 'express-session';
import { rememberMeMaxAge } from '../config/sessionDurations';

/**
 * What "signed in" means, decided once.
 *
 * A session passes through states before it is a sign-in: after a correct
 * password for an account with MFA on it holds only the pending fields until
 * the code is entered. The REST guards, the socket handshake and the check a
 * socket makes before joining a campaign all read this one answer, so none of
 * them can admit a session another refuses. The password-change gate is
 * separate: that session is signed in, and may do one thing.
 */

/**
 * A sign-in older than this has ended whatever it has been doing: the
 * remember-me window, 30 days unless REMEMBER_ME_MAX_AGE says otherwise.
 * Sessions expired only through inactivity, and an open campaign tab pings
 * the server every ten minutes, so a tab left open kept a sign-in alive for
 * ever and a remember-me cookie used once a month never expired.
 */
export function sessionHasAgedOut(session: Partial<SessionData> | undefined | null, now = Date.now()): boolean {
  return typeof session?.signedInAt === 'number' && now - session.signedInAt > rememberMeMaxAge;
}

/** The 401 for a sign-in that has aged out. */
export function agedOutMessage(): string {
  const days = Math.max(1, Math.round(rememberMeMaxAge / (24 * 60 * 60 * 1000)));
  return `Your sign-in has reached its ${days}-day limit. Sign in again.`;
}

/** A session that is signed in: a user, and no two-factor step left to finish. */
export function sessionIsSignedIn(session: Partial<SessionData> | undefined | null): session is Partial<SessionData> & { userId: string } {
  return !!session && !session.mfaPending && typeof session.userId === 'string' && session.userId !== '';
}

/**
 * Why a session is not signed in, as the REST guards answer it: 401 either
 * way, with the message the clients already know.
 */
export function notSignedInMessage(session: Partial<SessionData> | undefined | null): string {
  return session?.mfaPending
    ? 'MFA verification required. Please complete MFA login.'
    : 'You must be logged in to access this resource';
}
