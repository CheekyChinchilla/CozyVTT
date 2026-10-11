/**
 * A sign-in ends after the remember-me window however active it has been.
 *
 * Sessions expired only through inactivity, and the campaign page pings the
 * server every ten minutes while its socket is up, so a tab left open kept a
 * sign-in alive for ever, and a remember-me cookie used once a month never
 * expired. Each session now records when it was signed in, and the guards
 * refuse one older than REMEMBER_ME_MAX_AGE (30 days by default), ending it.
 * A session from before the field existed is stamped when next seen, so the
 * upgrade signs nobody out.
 */

import type { NextFunction, Request, Response } from 'express';
import type { SessionData } from 'express-session';
import { requireAuth } from '../auth';
import { rememberMeMaxAge } from '../../config/sessionDurations';

interface Answer {
  status?: number;
  body?: { error?: string; message?: string; code?: string };
  nexted: boolean;
  destroyed: boolean;
}

function run(guard: (req: Request, res: Response, next: NextFunction) => unknown, session: Partial<SessionData>): Answer & { session: Partial<SessionData> } {
  const answer: Answer = { nexted: false, destroyed: false };
  const live = {
    ...session,
    destroy(cb: (err?: unknown) => void) {
      answer.destroyed = true;
      cb();
    },
  };
  const res = {
    status(code: number) {
      answer.status = code;
      return this;
    },
    json(body: Answer['body']) {
      answer.body = body;
      return this;
    },
  } as unknown as Response;
  guard({ session: live } as unknown as Request, res, () => {
    answer.nexted = true;
  });
  return { ...answer, session: live };
}

const DAY = 24 * 60 * 60 * 1000;

it('lets a sign-in made within the window through', () => {
  const answer = run(requireAuth, { userId: 'u1', signedInAt: Date.now() - 29 * DAY });
  expect(answer).toMatchObject({ nexted: true, destroyed: false });
});

it('refuses and ends a sign-in older than the remember-me window, however recently it was used', () => {
  const answer = run(requireAuth, { userId: 'u1', signedInAt: Date.now() - rememberMeMaxAge - 60_000 });
  expect(answer.nexted).toBe(false);
  expect(answer.status).toBe(401);
  expect(answer.destroyed).toBe(true);
  expect(answer.body?.message).toBe('Your sign-in has reached its 30-day limit. Sign in again.');
});

// The pages carry the sentence to the sign-in page, so the person knows why
// they are there; the code says it is this refusal without reading the text.
it('marks that refusal with a code the pages can tell apart', () => {
  const answer = run(requireAuth, { userId: 'u1', signedInAt: Date.now() - rememberMeMaxAge - 60_000 });
  expect(answer.body).toEqual({
    error: 'Unauthorized',
    code: 'SIGN_IN_EXPIRED',
    message: 'Your sign-in has reached its 30-day limit. Sign in again.',
  });
});

it('stamps a sign-in from before the field existed when it is next seen, and lets it through', () => {
  const before = Date.now();
  const answer = run(requireAuth, { userId: 'u1' });
  expect(answer.nexted).toBe(true);
  expect(answer.session.signedInAt).toBeGreaterThanOrEqual(before);
});
