/**
 * How long a request waits in the wrong-answer limiter's queue.
 *
 * Near the limit the limiter lets through only as many checks as the
 * allowance has left, and the rest wait for one of those to finish. A check
 * that never finished (a database that stopped answering, say) held every
 * request behind it for as long as its connection stayed open. A waiting
 * request now gives up after a while and is told to try again, and is not
 * counted.
 */

import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { failureLimiter, type FailureLimiterOptions } from '../failureLimiter';

/**
 * An app whose route answers with the status asked for, except that `?stall`
 * holds its answer until `releaseStalled` is called, like a check whose
 * database has stopped answering.
 */
function stallingApp(options: FailureLimiterOptions) {
  const limiter = failureLimiter(options);
  const stalled: Response[] = [];
  const app = express();
  app.post('/probe', limiter, (req: Request, res: Response) => {
    if (req.query.stall !== undefined) {
      stalled.push(res);
      return;
    }
    const status = Number(req.query.status ?? 200);
    if (status >= 400) limiter.recordFailure(req);
    res.status(status).json({ ok: status < 400 });
  });
  const releaseStalled = () => {
    for (const res of stalled.splice(0)) res.status(200).json({ ok: true });
  };
  return { app, releaseStalled };
}

/** The answer, or 'still waiting' if none has come within `ms`. */
async function within<T>(ms: number, answer: Promise<T>): Promise<T | 'still waiting'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'still waiting'>((resolve) => { timer = setTimeout(() => resolve('still waiting'), ms); });
  try {
    return await Promise.race([answer, late]);
  } finally {
    clearTimeout(timer);
  }
}

describe('a request waiting behind a check that does not finish', () => {
  it('is refused after the wait, with a message, and is not counted', async () => {
    // Built outside the call so the option is passed as data.
    const options = { windowMs: 60_000, max: 2, message: 'Too many attempts', waitMs: 300 };
    const { app, releaseStalled } = stallingApp(options);
    const server = app.listen(0);
    try {
      // One wrong answer counted, one check stuck: the allowance is spoken for.
      expect((await request(server).post('/probe?status=401')).status).toBe(401);
      const stuck = request(server).post('/probe?stall=1').then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const waiting = await within(3000, request(server).post('/probe?status=200').then((res) => res));

      expect(waiting).not.toBe('still waiting');
      if (waiting === 'still waiting') return;
      expect(waiting.status).toBe(429);
      expect(waiting.body).toEqual({
        error: 'Rate Limited',
        message: 'Other attempts are still being checked. Please try again in a moment.',
      });
      expect(Number(waiting.headers['retry-after'])).toBeGreaterThan(0);

      // The refusal was not counted: once the stuck check finishes, a correct
      // answer goes through, and the allowance still has one wrong answer in it.
      releaseStalled();
      expect((await stuck).status).toBe(200);
      expect((await request(server).post('/probe?status=200')).status).toBe(200);
      expect((await request(server).post('/probe?status=401')).status).toBe(401);
      expect((await request(server).post('/probe?status=200')).status).toBe(429);
    } finally {
      releaseStalled();
      server.close();
    }
  });

  it('is let through as usual when the check ahead of it finishes in time', async () => {
    const options = { windowMs: 60_000, max: 2, message: 'Too many attempts', waitMs: 2000 };
    const { app, releaseStalled } = stallingApp(options);
    const server = app.listen(0);
    try {
      expect((await request(server).post('/probe?status=401')).status).toBe(401);
      const stuck = request(server).post('/probe?stall=1').then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const waiting = request(server).post('/probe?status=200').then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 100));
      releaseStalled();

      expect((await stuck).status).toBe(200);
      expect((await waiting).status).toBe(200);
    } finally {
      releaseStalled();
      server.close();
    }
  });
});
