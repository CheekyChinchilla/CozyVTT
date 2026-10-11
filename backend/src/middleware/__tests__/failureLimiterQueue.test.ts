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

/**
 * POST /api/auth/login runs two of these limiters in a row (the address, then
 * the account). Each held a request for up to its own wait, so a sign-in could
 * wait twice as long as one limiter allows, which is the whole 30 seconds the
 * page waits for an answer. The wait is one budget for the chain.
 */
describe('a request passing through two limiters in a row', () => {
  it('waits no longer in total than one limiter lets it wait', async () => {
    const waitMs = 600;
    const first = failureLimiter({ windowMs: 60_000, max: 2, message: 'Too many attempts', waitMs });
    const second = failureLimiter({ windowMs: 60_000, max: 2, message: 'Too many attempts', waitMs });
    const stalledFirst: Response[] = [];
    const stalledSecond: Response[] = [];
    const releaseFirst = () => { for (const res of stalledFirst.splice(0)) res.status(200).json({ ok: true }); };
    const releaseSecond = () => { for (const res of stalledSecond.splice(0)) res.status(200).json({ ok: true }); };

    const app = express();
    // The chain under test: both limiters, then a route that fails or answers.
    app.post('/probe', first, second, (req: Request, res: Response) => {
      const status = Number(req.query.status ?? 200);
      if (status >= 400) {
        first.recordFailure(req);
        second.recordFailure(req);
      }
      res.status(status).json({ ok: status < 400 });
    });
    // One check stuck behind each limiter alone, so that each is full.
    app.post('/first-only', first, (_req: Request, res: Response) => { stalledFirst.push(res); });
    app.post('/second-only', second, (_req: Request, res: Response) => { stalledSecond.push(res); });

    const server = app.listen(0);
    let stuckSecond: Promise<unknown> = Promise.resolve();
    try {
      // A wrong answer counted by both, then a stuck check in each.
      expect((await request(server).post('/probe?status=401')).status).toBe(401);
      const stuckFirst = request(server).post('/first-only').then((res) => res);
      stuckSecond = request(server).post('/second-only').then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The request waits in the first limiter; the check ahead of it ends just
      // before the wait does, and it meets the full second limiter.
      const started = Date.now();
      const waiting = request(server).post('/probe?status=200').then((res) => res);
      await new Promise((resolve) => setTimeout(resolve, waitMs - 100));
      releaseFirst();
      expect((await stuckFirst).status).toBe(200);

      const answer = await within(waitMs * 3, waiting);
      const waited = Date.now() - started;

      expect(answer).not.toBe('still waiting');
      if (answer === 'still waiting') return;
      expect(answer.status).toBe(429);
      expect(answer.body.message).toBe('Other attempts are still being checked. Please try again in a moment.');
      // One budget: about waitMs, not waitMs for each limiter.
      expect(waited).toBeLessThan(waitMs * 1.5);
    } finally {
      releaseFirst();
      releaseSecond();
      await stuckSecond;
      server.close();
    }
  });
});
