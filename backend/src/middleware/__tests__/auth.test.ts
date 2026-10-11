/**
 * The sign-in guards agree on what "signed in" means.
 *
 * requireAuth refused a session that was waiting at the two-factor step, but
 * requireAdmin and requireRole checked only the user id and the role, so a
 * session holding a user id while MFA was pending passed them. Nothing writes
 * such a session today; the three guards now share one answer, so a future
 * sign-in change cannot open the gap.
 */

import type { NextFunction, Request, Response } from 'express';
import type { SessionData } from 'express-session';
import { requireAuth, requireAdmin, requireRole } from '../auth';

interface Answer {
  status?: number;
  body?: { error?: string; message?: string };
  nexted: boolean;
}

function run(guard: (req: Request, res: Response, next: NextFunction) => unknown, session: Partial<SessionData>): Answer {
  const answer: Answer = { nexted: false };
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
  guard({ session } as unknown as Request, res, () => {
    answer.nexted = true;
  });
  return answer;
}

const signedInAdmin: Partial<SessionData> = { userId: 'u1', platformRole: 'ADMIN' };

describe.each([
  ['requireAuth', requireAuth],
  ['requireAdmin', requireAdmin],
  ['requireRole(ADMIN)', requireRole('ADMIN')],
])('%s', (_name, guard) => {
  it('lets a signed-in admin through', () => {
    expect(run(guard, signedInAdmin)).toEqual({ nexted: true });
  });

  it('refuses a session with nobody signed in', () => {
    const answer = run(guard, {});
    expect(answer.nexted).toBe(false);
    expect(answer.status).toBe(401);
  });

  it('refuses a session still waiting at the two-factor step, even one holding a user id', () => {
    const answer = run(guard, { ...signedInAdmin, mfaPending: true, mfaPendingUserId: 'u1' });
    expect(answer.nexted).toBe(false);
    expect(answer.status).toBe(401);
    expect(answer.body?.message).toBe('MFA verification required. Please complete MFA login.');
  });
});

it('requireAdmin refuses a signed-in user who is not an admin with 403', () => {
  const answer = run(requireAdmin, { userId: 'u1', platformRole: 'USER' });
  expect(answer).toMatchObject({ nexted: false, status: 403 });
});

it('requireRole refuses another role with 403', () => {
  const answer = run(requireRole('USER'), signedInAdmin);
  expect(answer).toMatchObject({ nexted: false, status: 403 });
});
