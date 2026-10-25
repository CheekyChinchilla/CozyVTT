/**
 * At most two requests that hash or check a password at once from one
 * address.
 *
 * The server runs HASH_SLOTS hashes at once with HASH_QUEUE_MAX more waiting,
 * first come first served (services/auth.ts), and a correct password is never
 * counted by the sign-in limits. So one address posting its own correct
 * password to the sign-in again and again, or asking for new backup codes
 * (eleven hashes each), could keep that line full, and every other sign-in on
 * the instance was answered 503. Holding each address to two requests in it
 * leaves the rest of the line for everyone else.
 *
 * A third request at once from the address is answered 429 with a message and
 * Retry-After, and counts against nothing. Its place is given back when the
 * answer is sent or the client goes away, however the route ended, so only
 * requests still running are counted. Counted under the address as the other
 * limiters count it (failureLimiter's addressKey). Kept in memory; a restart
 * forgets it and loses nothing.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { addressKey } from './failureLimiter';

/** Requests that hash or check a password one address may have running at once. */
export const HASHING_PER_ADDRESS = 2;

/** What a third request at once is told. */
export const HASHING_AT_ONCE_MESSAGE = 'Too many password checks from your address at once. Please try again in a moment.';

/** The Retry-After sent with that refusal, in seconds. */
const RETRY_SECONDS = 2;

const running = new Map<string, number>();

/** How many requests that hash are running for this request's address; for the tests. */
export function hashingRunningFor(req: Request): number {
  return running.get(addressKey(req)) ?? 0;
}

function hold(req: Request, res: Response, next: NextFunction): void {
  const key = addressKey(req);
  const count = running.get(key) ?? 0;
  if (count >= HASHING_PER_ADDRESS) {
    res.setHeader('Retry-After', String(RETRY_SECONDS));
    res.status(429).json({ error: 'Rate Limited', message: HASHING_AT_ONCE_MESSAGE });
    return;
  }
  running.set(key, count + 1);
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    const left = (running.get(key) ?? 1) - 1;
    if (left <= 0) running.delete(key);
    else running.set(key, left);
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}

/** On every route that always hashes or checks a password. */
export const hashingPerAddress: RequestHandler = function hashingPerAddress(req, res, next) {
  hold(req, res, next);
};

/**
 * On a route that hashes only for some requests (a backup code at the code
 * step, a password confirmed on a profile edit): those are held to the limit,
 * and the others neither held nor counted.
 */
export function hashingPerAddressWhen(hashes: (req: Request) => boolean): RequestHandler {
  return function hashingPerAddress(req, res, next) {
    if (!hashes(req)) {
      next();
      return;
    }
    hold(req, res, next);
  };
}
