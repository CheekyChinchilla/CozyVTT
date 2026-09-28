/**
 * An account registered while admin approval is required is never approved.
 *
 * The approval flag defaults to true in the schema, so an account created
 * without saying otherwise is approved from the moment the row exists. The
 * account has to be created unapproved in the same write, or there is a window
 * (and, if a second write fails, a permanent state) in which it can sign in.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

jest.mock('../../services/systemSettings', () => ({
  getSystemSettings: jest.fn().mockResolvedValue({
    id: 'test-settings',
    setupCompleted: true,
    instanceName: 'CozyVTT Test',
    timezone: 'UTC',
    allowRegistration: true,
    requireAdminApproval: true,
  }),
  getAppearanceSettings: jest.fn(),
  isSetupCompleted: jest.fn().mockResolvedValue(true),
  updateSystemSettings: jest.fn(),
  markSetupCompleted: jest.fn(),
  hasUsers: jest.fn().mockResolvedValue(true),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

beforeAll(async () => {
  // Registration only asks about approval once the instance has a user.
  const anchor = await createTestUser({ email: `approval-anchor-${stamp}@test.cozyvtt.local` });
  created.push(anchor.id);
});

afterAll(async () => {
  const rows = await prisma.user.findMany({
    where: { AND: [{ email: { startsWith: 'approval-' } }, { email: { contains: `-${stamp}@` } }] },
    select: { id: true },
  });
  await cleanupUsers([...created, ...rows.map((r) => r.id)]);
  await prisma.$disconnect();
});

it('creates the account unapproved even if nothing else is written after it', async () => {
  const email = `approval-fail-${stamp}@test.cozyvtt.local`;
  // A write after the create fails. The account must not be left approved.
  const update = jest.spyOn(appPrisma.user, 'update').mockRejectedValueOnce(new Error('database blip'));
  try {
    await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD, displayName: 'Pending' });
  } finally {
    update.mockRestore();
  }

  const row = await prisma.user.findUnique({ where: { email } });
  if (row) expect(row.isApproved).toBe(false);
});

it('answers that the account is pending, and refuses to sign it in', async () => {
  const email = `approval-pending-${stamp}@test.cozyvtt.local`;
  const res = await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD, displayName: 'Pending' });
  expect(res.status).toBe(201);
  expect(res.body.pendingApproval).toBe(true);

  const row = await prisma.user.findUnique({ where: { email } });
  expect(row?.isApproved).toBe(false);

  const login = await request(app).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(login.status).toBe(403);
});
