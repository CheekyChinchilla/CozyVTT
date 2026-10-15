/**
 * Taking the admin role away is decided from the row as it is when written.
 *
 * PUT /api/users/:id decided whether a request was a demotion from a row read
 * before the serializable transaction. A promotion landing between that read
 * and the write left the request looking like a change from USER to USER: it
 * skipped the last-admin check, and it skipped what a demotion does after
 * (ending the person's sign-ins and writing the log line), so the instance
 * could be left with no admin and the demoted person kept their session.
 *
 * "The only admin" is a count over the whole users table, which other test
 * files share, so the first test answers that question itself as
 * lastAdmin.e2e.test.ts does.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

// Every limiter lets the request through. The rest of the package stays
// real: the sign-in limiter keys an address with its ipKeyGenerator.
jest.mock('express-rate-limit', () => ({
  ...jest.requireActual<typeof import('express-rate-limit')>('express-rate-limit'),
  __esModule: true,
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import * as platformAdmins from '../../services/platformAdmins';
import * as sessionStore from '../../services/sessionStore';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

async function signedInAdmin(label: string) {
  const user = await createTestUser({ email: `demote-read-${label}-${stamp}@test.cozyvtt.local`, role: 'ADMIN' });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/**
 * Promote `userId` to admin right after the route has read that account, which
 * is the window a promotion from another request lands in. The route's own
 * client is spied on; the test's client makes the promotion.
 */
function promoteAfterTheRouteReads(userId: string) {
  const read = appPrisma.user.findUnique.bind(appPrisma.user);
  const promoteOnce = (() => {
    let done = false;
    return async () => {
      if (done) return;
      done = true;
      await prisma.user.update({ where: { id: userId }, data: { platformRole: 'ADMIN' } });
    };
  })();
  const spy = jest.spyOn(appPrisma.user, 'findUnique');
  spy.mockImplementation(((args: Prisma.UserFindUniqueArgs) => {
    const answer = read(args);
    if (args.where.id !== userId) return answer;
    return answer.then(async (row) => {
      await promoteOnce();
      return row;
    });
  }) as unknown as typeof appPrisma.user.findUnique);
}

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

it('refuses to demote the only admin when a promotion landed after the route read the account', async () => {
  const { agent } = await signedInAdmin('only');
  const target = await createTestUser({ email: `demote-read-target-${stamp}@test.cozyvtt.local` });
  created.push(target.id);
  jest.spyOn(platformAdmins, 'isOnlyAdmin').mockResolvedValueOnce(true);
  promoteAfterTheRouteReads(target.id);

  const res = await agent.put(`/api/users/${target.id}`).send({ platformRole: 'USER' });

  expect(res.status).toBe(409);
  expect(res.body.message).toMatch(/only admin/i);
  jest.restoreAllMocks();
  expect((await prisma.user.findUnique({ where: { id: target.id } }))?.platformRole).toBe('ADMIN');
});

it('treats an account promoted after the read as demoted: signs it out and writes the log line', async () => {
  const { user: admin, agent } = await signedInAdmin('other');
  const target = await createTestUser({ email: `demote-read-logged-${stamp}@test.cozyvtt.local` });
  created.push(target.id);
  const endedSignIns = jest.spyOn(sessionStore, 'destroyUserLoginSessions');
  promoteAfterTheRouteReads(target.id);

  const res = await agent.put(`/api/users/${target.id}`).send({ platformRole: 'USER' });

  expect(res.status).toBe(200);
  expect(endedSignIns).toHaveBeenCalledWith(target.id);
  jest.restoreAllMocks();
  expect((await prisma.user.findUnique({ where: { id: target.id } }))?.platformRole).toBe('USER');
  const logged = await prisma.systemLog.findFirst({
    where: { userId: admin.id, message: `Removed the administrator role from ${target.email}` },
  });
  expect(logged).not.toBeNull();
});
