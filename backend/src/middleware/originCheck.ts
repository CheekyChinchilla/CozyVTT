/**
 * Refuse a state-changing request a browser sent from another site.
 *
 * The session cookie is SameSite=Lax, and a page on another port of the same
 * host, or on a sibling subdomain, counts as the same site: its browser sends
 * the cookie along. Without this, such a page could post to the API, a backup
 * restore included, or open a live connection, as whoever was signed in.
 *
 * Browsers say where a request came from in Sec-Fetch-Site. A request from the
 * page itself (`same-origin`) or typed into the address bar (`none`) passes,
 * and so does one from the address CORS_ORIGIN names, which is how a frontend
 * served from its own address works. A client that is not a browser sends no
 * such header and is not a cross-site risk: it passes, and signs in like the
 * web client does. A browser too old to send the header is not protected by
 * this; every current one sends it.
 *
 * The Origin header alone is not compared with the host: the bundled nginx
 * forwards the host without its port, so another port on the same address
 * would look like this one.
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import type { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const header = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function crossSiteRefused(headers: IncomingHttpHeaders): boolean {
  const site = header(headers['sec-fetch-site']);
  if (site === undefined || site === 'same-origin' || site === 'none') return false;
  return header(headers.origin) !== (process.env.CORS_ORIGIN || 'http://localhost:3000');
}

/** Express middleware: state-changing methods only. */
export function originCheck(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || !crossSiteRefused(req.headers)) {
    next();
    return;
  }
  res.status(403).json({ error: 'Forbidden', message: 'Requests from another site are not accepted' });
}

/** Socket.io's allowRequest: the handshake of a live connection, which acts as the user. */
export function socketAllowRequest(req: IncomingMessage, callback: (err: string | null | undefined, success: boolean) => void): void {
  const refused = crossSiteRefused(req.headers);
  callback(refused ? 'Requests from another site are not accepted' : null, !refused);
}
