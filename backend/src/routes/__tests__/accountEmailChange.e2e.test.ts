/**
 * Changing an account's email address.
 *
 * The address is where password-reset links go, so changing it is as good as
 * holding the password: a stolen session that could move the address could
 * then reset the password from a mailbox of its choosing and keep the account.
 * So a user changing their own address confirms their current password, the
 * old address is told, and any reset or invitation link already sent stops
 * working. An admin changing someone else's address needs no password (they
 * do not have it); the notice and the voided links still apply.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: jest.fn(() => true),
  sendEmailChangedNotice: jest.fn(async () => undefined),
}));

import crypto from 'crypto';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import * as email from '../../services/email';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];
const smtp = email.isSmtpConfigured as jest.MockedFunction<typeof email.isSmtpConfigured>;
// Looked up by name: the function does not exist until the fix adds it, and
// the test has to be able to fail rather than not compile.
const notice = (email as unknown as { sendEmailChangedNotice: jest.Mock }).sendEmailChangedNotice;

const address = (label: string) => `emailchange-${label}-${stamp}@test.cozyvtt.local`;

async function signedIn(label: string, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await createTestUser({ email: address(label), displayName: `Owner ${label}`, role });
  created.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

async function link(userId: string): Promise<string> {
  const token = crypto.randomUUID();
  await prisma.passwordResetToken.create({
    data: { userId, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

beforeEach(() => {
  notice.mockClear();
  notice.mockImplementation(async () => undefined);
  smtp.mockReturnValue(true);
});

afterAll(async () => {
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('a user changing their own address', () => {
  it('is refused without the current password', async () => {
    const { user, agent } = await signedIn('nopw');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: address('nopw-new') });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current password/i);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.email).toBe(user.email);
  });

  it('is refused with the wrong password', async () => {
    const { user, agent } = await signedIn('badpw');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: address('badpw-new'), currentPassword: 'NotTheRightOne1!' });
    expect(res.status).toBe(401);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.email).toBe(user.email);
  });

  it('does not say whether an address is taken before the password is checked', async () => {
    const { user, agent } = await signedIn('probe');
    const other = await createTestUser({ email: address('probe-taken') });
    created.push(other.id);
    const res = await agent.put(`/api/users/${user.id}`).send({ email: other.email });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current password/i);
  });

  it('succeeds with the current password, tells the old address and voids outstanding links', async () => {
    const { user, agent } = await signedIn('ok');
    const outstanding = await link(user.id);
    const newAddress = address('ok-new');

    const res = await agent.put(`/api/users/${user.id}`).send({ email: newAddress, currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(newAddress);

    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(user.email, newAddress, user.displayName);

    const reset = await request(app).post('/api/auth/reset-password').send({ token: outstanding, newPassword: 'HijackedPass99!' });
    expect(reset.status).toBe(400);
  });

  it('needs no password when the address is not actually changing', async () => {
    const { user, agent } = await signedIn('same');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: user.email.toUpperCase() });
    expect(res.status).toBe(200);
    expect(notice).not.toHaveBeenCalled();
  });

  it('asks an admin for their password when the address is their own', async () => {
    const { user, agent } = await signedIn('admin-self', 'ADMIN');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: address('admin-self-new') });
    expect(res.status).toBe(400);
  });
});

describe('an admin changing someone else\'s address', () => {
  it('needs no password, tells the old address and voids outstanding links', async () => {
    const { agent } = await signedIn('admin', 'ADMIN');
    const target = await createTestUser({ email: address('target'), displayName: 'Target' });
    created.push(target.id);
    const outstanding = await link(target.id);

    const res = await agent.put(`/api/users/${target.id}`).send({ email: address('target-new') });
    expect(res.status).toBe(200);
    expect(notice).toHaveBeenCalledWith(target.email, address('target-new'), 'Target');

    const row = await prisma.passwordResetToken.findUnique({ where: { token: outstanding } });
    expect(row?.used).toBe(true);
  });
});

describe('the notice to the old address', () => {
  it('is skipped, and the change still made, when the instance cannot send email', async () => {
    smtp.mockReturnValue(false);
    const { user, agent } = await signedIn('nosmtp');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: address('nosmtp-new'), currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(notice).not.toHaveBeenCalled();
  });

  it('does not fail the change when sending it fails', async () => {
    notice.mockRejectedValueOnce(new Error('SMTP refused'));
    const { user, agent } = await signedIn('smtpfail');
    const res = await agent.put(`/api/users/${user.id}`).send({ email: address('smtpfail-new'), currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.email).toBe(address('smtpfail-new'));
  });
});
