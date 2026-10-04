/**
 * An instance always keeps an admin.
 *
 * With no admin left nobody can reach the admin panel, setup refuses to run
 * again once it has, and the first-user-becomes-admin rule only fires on an
 * empty instance, so there is no way back short of editing the database. The
 * only admin therefore cannot delete their own account or give up the role;
 * they are told to promote someone else first.
 *
 * "The only admin" is a count over the whole users table, which other test
 * files share and fill with admins of their own, so the tests that need it
 * answer the count themselves. The tests where another admin exists create
 * one, so the real count is right for them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

async function signedInAdmin(label: string) {
  const user = await createTestUser({ email: `lastadmin-${label}-${stamp}@test.cozyvtt.local`, role: 'ADMIN' });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** Make the next count of other admins come back as none. */
function noOtherAdmins() {
  return jest.spyOn(appPrisma.user, 'count').mockResolvedValueOnce(0);
}

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('DELETE /api/auth/account', () => {
  it('refuses the only admin, and says to promote another admin first', async () => {
    const { user, agent } = await signedInAdmin('delete-only');
    noOtherAdmins();

    const res = await agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/promote another/i);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('lets an admin go when another admin remains', async () => {
    await signedInAdmin('delete-other');
    const { user, agent } = await signedInAdmin('delete-leaving');

    const res = await agent.delete('/api/auth/account').send({ password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });
});

describe('PUT /api/users/:id platformRole', () => {
  it('refuses the only admin demoting themselves', async () => {
    const { user, agent } = await signedInAdmin('demote-only');
    noOtherAdmins();

    const res = await agent.put(`/api/users/${user.id}`).send({ platformRole: 'USER' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/promote another/i);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.platformRole).toBe('ADMIN');
  });

  it('lets an admin step down when another admin remains', async () => {
    await signedInAdmin('demote-other');
    const { user, agent } = await signedInAdmin('demote-stepping');

    const res = await agent.put(`/api/users/${user.id}`).send({ platformRole: 'USER' });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.platformRole).toBe('USER');
  });
});
