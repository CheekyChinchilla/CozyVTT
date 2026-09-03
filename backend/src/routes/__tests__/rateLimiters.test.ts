/**
 * Auth rate limiters.
 *
 * The behaviour under test is `skipSuccessfulRequests`: a brute-force guard
 * exists to stop repeated *wrong* answers, so counting the right ones as well
 * punished the legitimate user. Five correct logins inside fifteen minutes used
 * to lock the account out — and because the key is the client IP, on a
 * self-hosted instance behind a proxy that budget of five was shared by
 * everyone in the building.
 *
 * These mount the real limiters on a bare Express app. They cannot live in
 * `auth.e2e.test.ts`, which mocks `express-rate-limit` away entirely so the rest
 * of the suite can exceed the allowance freely — meaning nothing exercised this
 * before.
 *
 * Each test uses its own distinct client IP, because the limiter keys on IP and
 * its store is shared for the lifetime of the module.
 */

import express, { Request, Response } from 'express';
import request from 'supertest';

import { credentialLimiter, emailDispatchLimiter, accountCreationLimiter } from '../auth';
import { mfaLoginLimiter, mfaSetupLimiter } from '../mfa';

type Limiter = typeof credentialLimiter;

/**
 * An app whose single route answers with whatever status the caller asks for,
 * so a test can drive the limiter with successes or failures on demand.
 */
function appWith(limiter: Limiter) {
  const app = express();
  // Matches server.ts: trust exactly one hop, so `req.ip` is the client address
  // from X-Forwarded-For rather than the proxy's. `true` would trust any number
  // of hops, which lets a client spoof its own address — express-rate-limit
  // warns about precisely that, and production does not do it either.
  app.set('trust proxy', 1);
  app.post('/probe', limiter, (req: Request, res: Response) => {
    const status = Number(req.query.status ?? 200);
    return res.status(status).json({ ok: status < 400 });
  });
  return app;
}

/** Fire one request from a fixed client IP, so each test gets its own bucket. */
function hit(app: express.Express, ip: string, status: number) {
  return request(app)
    .post(`/probe?status=${status}`)
    .set('X-Forwarded-For', ip);
}

describe('credentialLimiter', () => {
  it('does not count successful requests towards the allowance', async () => {
    const app = appWith(credentialLimiter);
    const ip = '10.0.0.1';

    // Well past the max of 5. Before `skipSuccessfulRequests` the sixth of
    // these was a 429 — the bug that prompted the change.
    for (let i = 0; i < 12; i++) {
      const res = await hit(app, ip, 200);
      expect(res.status).toBe(200);
    }
  });

  it('still locks out after 5 failures', async () => {
    const app = appWith(credentialLimiter);
    const ip = '10.0.0.2';

    for (let i = 0; i < 5; i++) {
      expect((await hit(app, ip, 401)).status).toBe(401);
    }
    expect((await hit(app, ip, 401)).status).toBe(429);
  });

  it('counts only the failures when successes are interleaved', async () => {
    const app = appWith(credentialLimiter);
    const ip = '10.0.0.3';

    // Four failures and a pile of successes: still under the limit, because the
    // successes are skipped.
    for (let i = 0; i < 4; i++) await hit(app, ip, 401);
    for (let i = 0; i < 6; i++) expect((await hit(app, ip, 200)).status).toBe(200);

    // The fifth failure is allowed through; the sixth is refused.
    expect((await hit(app, ip, 401)).status).toBe(401);
    expect((await hit(app, ip, 401)).status).toBe(429);
  });

  it('keeps buckets separate per client', async () => {
    const app = appWith(credentialLimiter);

    for (let i = 0; i < 6; i++) await hit(app, '10.0.0.4', 401);
    expect((await hit(app, '10.0.0.4', 401)).status).toBe(429);

    // A different client is unaffected — one person guessing wrong must not
    // lock anybody else out.
    expect((await hit(app, '10.0.0.5', 401)).status).toBe(401);
  });
});

describe('emailDispatchLimiter', () => {
  // /forgot-password answers 200 whether or not the address exists, so that it
  // cannot be used to discover who has an account — and sends an email on the
  // way. Skipping successful requests would therefore leave the send path with
  // no limit at all.
  it('counts successful requests, because the success is the thing being limited', async () => {
    const app = appWith(emailDispatchLimiter);
    const ip = '10.0.1.1';

    for (let i = 0; i < 5; i++) {
      expect((await hit(app, ip, 200)).status).toBe(200);
    }
    expect((await hit(app, ip, 200)).status).toBe(429);
  });
});

describe('accountCreationLimiter', () => {
  /**
   * Registration has no wrong answer to repeat, so `skipSuccessfulRequests` —
   * right for a credential check — leaves the endpoint effectively unlimited:
   * only failures count, and creating an account is a success. While /register
   * shared the credential limiter, an instance with open registration could be
   * filled with accounts by anyone able to reach it.
   */
  it('counts the accounts it creates, not just the attempts that fail', async () => {
    const app = appWith(accountCreationLimiter);
    const ip = '10.0.5.1';

    for (let i = 0; i < 10; i++) {
      expect((await hit(app, ip, 201)).status).toBe(201);
    }
    expect((await hit(app, ip, 201)).status).toBe(429);
  });

  it('is more generous than the credential limiter, for a shared address', async () => {
    // A household behind one address may legitimately sign several people up in
    // a sitting; five would be too few.
    const app = appWith(accountCreationLimiter);
    const ip = '10.0.5.2';

    for (let i = 0; i < 6; i++) {
      expect((await hit(app, ip, 201)).status).toBe(201);
    }
  });

  it('keeps buckets separate per client', async () => {
    const app = appWith(accountCreationLimiter);

    for (let i = 0; i < 10; i++) await hit(app, '10.0.5.3', 201);
    expect((await hit(app, '10.0.5.3', 201)).status).toBe(429);

    expect((await hit(app, '10.0.5.4', 201)).status).toBe(201);
  });
});

describe('MFA limiters', () => {
  it.each([
    ['mfaSetupLimiter', mfaSetupLimiter, '10.0.2.1'],
    ['mfaLoginLimiter', mfaLoginLimiter, '10.0.2.2'],
  ])('%s does not spend the allowance on a correct code', async (_name, limiter, ip) => {
    const app = appWith(limiter);
    for (let i = 0; i < 8; i++) {
      expect((await hit(app, ip, 200)).status).toBe(200);
    }
  });

  it.each([
    ['mfaSetupLimiter', mfaSetupLimiter, '10.0.3.1'],
    ['mfaLoginLimiter', mfaLoginLimiter, '10.0.3.2'],
  ])('%s still locks out after 5 wrong codes', async (_name, limiter, ip) => {
    const app = appWith(limiter);
    for (let i = 0; i < 5; i++) await hit(app, ip, 401);
    expect((await hit(app, ip, 401)).status).toBe(429);
  });

  it('keeps the setup and login windows separate', async () => {
    const ip = '10.0.4.1';
    const setupApp = appWith(mfaSetupLimiter);
    const loginApp = appWith(mfaLoginLimiter);

    // Exhaust setup for this client...
    for (let i = 0; i < 6; i++) await hit(setupApp, ip, 401);
    expect((await hit(setupApp, ip, 401)).status).toBe(429);

    // ...and logging in is still available to them.
    expect((await hit(loginApp, ip, 401)).status).toBe(401);
  });
});
