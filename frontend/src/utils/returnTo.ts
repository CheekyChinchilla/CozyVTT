/**
 * The page to go back to after signing in.
 *
 * The sign-in page carries it as `?next=`, through the code step, from a page
 * that needed a sign-in. Anything in a query string can be written by whoever
 * made the link, so only a path on this site is followed: one that starts
 * with a single `/`, holds no character a browser would drop or turn into a
 * slash, stays on this origin and starts with a single `/` once parsed, and is
 * not a page anyone can open already (the sign-in page itself among them).
 * Anything else goes to the dashboard.
 */

import { isPublicPath } from './publicRoutes';

/** Where a sign-in goes when there is no page to go back to. */
export const AFTER_SIGN_IN = '/dashboard';

/** The query parameter that carries the page. */
const PARAM = 'next';

/** Longer than any path the app makes; a longer one is not followed. */
const MAX_LENGTH = 2048;

/** `value` as a path on this site worth going back to, or null. */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return null;
  // One leading slash: `//host` and `/\host` are other sites to a browser.
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  // Browsers drop tabs and line breaks from addresses, so `/\t/host` is `//host`.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Parsing removes dot segments, so `/.//host` comes out as `//host`: check again.
  if (url.pathname.startsWith('//')) return null;
  if (isPublicPath(url.pathname) || url.pathname === AFTER_SIGN_IN) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The page carried in `search` (a location's query string), if it is safe to follow. */
export function returnPathFrom(search: string): string | null {
  return safeReturnPath(new URLSearchParams(search).get(PARAM));
}

/** The sign-in page, carrying `from` when it is worth coming back to. */
export function signInPath(from: string): string {
  const path = safeReturnPath(from);
  return path ? `/auth/login?${PARAM}=${encodeURIComponent(path)}` : '/auth/login';
}

/** `base` carrying the same page as `search` does, for a step of the sign-in. */
export function keepingReturnPath(base: string, search: string): string {
  const path = returnPathFrom(search);
  return path ? `${base}?${PARAM}=${encodeURIComponent(path)}` : base;
}
