/**
 * A limit on wrong answers: wrong passwords, wrong codes, bad reset links.
 * Nothing else counts, not a correct answer and not a refusal. Counted per
 * address unless `key` says otherwise: per account for the sign-in, per
 * pending sign-in for the code step, per signed-in user for a password check.
 *
 * The limit is checked before the route checks the credential, and the route
 * says when an answer was wrong (`recordFailure`). Counting on arrival and
 * taking a correct answer back off once it had finished, as express-rate-limit
 * does, refused correct sign-ins that arrived together: all of them were
 * counted before any finished. Its refusals then stayed counted, so a burst
 * of correct sign-ins could lock an address out for the whole window.
 *
 * Answers still being checked are held to the allowance left: with three
 * failures counted, two may be checked at once, and the rest wait their turn
 * rather than being refused. So wrong answers sent together never get more
 * than the allowance, and correct ones sent together all get through. Waiting
 * costs little, since the password check is the slow part and the server runs
 * only a few of those at a time anyway.
 *
 * A refusal is JSON, `{ error: 'Rate Limited', message }`, like every other
 * answer the API gives, so the pages can show the message.
 *
 * Kept in memory, like the other limiters: a restart forgets it.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface FailureLimiter extends RequestHandler {
  /** Count one wrong answer against this request's key (its address, unless `key` says otherwise). */
  recordFailure(req: Request): void;
}

export interface FailureLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
  /**
   * What a request is counted against. The default is the client address as
   * Express reads it with the app's `trust proxy` setting. Returning null
   * means the request is neither held to the limit nor counted: a sign-in
   * body with no usable email, a code step with no sign-in pending.
   */
  key?: (req: Request) => string | null;
  /** Called once each time a key's failures reach the limit, with the request that did it. */
  onLimit?: (req: Request, key: string) => void;
}

interface AddressState {
  /** When each counted failure happened, oldest first. */
  failures: number[];
  /** Requests let through whose answer is not known yet. */
  checking: number;
  /** Requests waiting for one of those to finish, in the order they came. */
  waiting: Array<() => void>;
}

export function failureLimiter(options: FailureLimiterOptions): FailureLimiter {
  const { windowMs, max, message, onLimit } = options;
  const addresses = new Map<string, AddressState>();

  // The address as Express reads it with the app's `trust proxy` setting,
  // which is what express-rate-limit keyed on.
  const byAddress = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const keyOf = options.key ?? byAddress;

  const stateOf = (key: string): AddressState => {
    let state = addresses.get(key);
    if (!state) {
      state = { failures: [], checking: 0, waiting: [] };
      addresses.set(key, state);
    }
    return state;
  };

  const prune = (state: AddressState, now: number): void => {
    while (state.failures.length > 0 && now - state.failures[0] >= windowMs) state.failures.shift();
  };

  const forgetIfIdle = (key: string, state: AddressState): void => {
    if (state.failures.length === 0 && state.checking === 0 && state.waiting.length === 0 && addresses.get(key) === state) {
      addresses.delete(key);
    }
  };

  /** The standard rate-limit headers, as the limiter this replaced sent them. */
  const setHeaders = (res: Response, state: AddressState, now: number): void => {
    const resetSeconds = state.failures.length > 0 ? Math.ceil((state.failures[0] + windowMs - now) / 1000) : 0;
    res.setHeader('RateLimit-Policy', `${max};w=${Math.round(windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - state.failures.length - state.checking)));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
  };

  const limiter = (req: Request, res: Response, next: NextFunction): void => {
    const key = keyOf(req);
    if (key === null) {
      next();
      return;
    }
    const state = stateOf(key);

    const admit = (): void => {
      // Gone while it waited: there is nobody to answer.
      if (res.destroyed || res.writableEnded) return;
      const now = Date.now();
      prune(state, now);

      if (state.failures.length >= max) {
        setHeaders(res, state, now);
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((state.failures[0] + windowMs - now) / 1000))));
        res.status(429).json({ error: 'Rate Limited', message });
        return;
      }
      if (state.failures.length + state.checking >= max) {
        state.waiting.push(admit);
        return;
      }

      state.checking += 1;
      setHeaders(res, state, now);
      let released = false;
      const release = (): void => {
        if (released) return;
        released = true;
        state.checking -= 1;
        for (const waiter of state.waiting.splice(0)) waiter();
        forgetIfIdle(key, state);
      };
      res.on('finish', release);
      res.on('close', release);
      next();
    };

    admit();
  };

  // Addresses whose failures have all aged out are dropped as they are next
  // seen; this catches the ones that are not seen again.
  setInterval(() => {
    const now = Date.now();
    for (const [key, state] of addresses) {
      prune(state, now);
      forgetIfIdle(key, state);
    }
  }, 60 * 1000).unref();

  return Object.assign(limiter, {
    recordFailure(req: Request): void {
      const key = keyOf(req);
      if (key === null) return;
      const state = stateOf(key);
      const now = Date.now();
      prune(state, now);
      const before = state.failures.length;
      state.failures.push(now);
      if (before < max && state.failures.length >= max) onLimit?.(req, key);
    },
  });
}
