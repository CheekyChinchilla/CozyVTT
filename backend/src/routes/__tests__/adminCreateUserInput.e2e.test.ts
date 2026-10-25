/**
 * What the Admin Panel's Create User, Invite User and Resend Invite accept.
 *
 * - The address checked for a duplicate is the address stored. The check used
 *   the address as typed while the account was stored with its angle
 *   brackets removed, so `jo<x>@example.com` became `jox@example.com`, and
 *   the welcome email and its temporary password went to that mailbox
 *   instead. An address with angle brackets is now refused, and an address
 *   taken between the check and the write answers 409, not 500.
 * - The display name is checked the way sign-up and the profile check it.
 *   It was stripped and cut to 50 characters, so a name typed as `<>` was
 *   saved empty.
 * - Changing an account's address to one taken between the check and the
 *   write answers as a taken address does, not 500.
 * - Resend Invite sends a 7-day link that sets the password. It is for an
 *   account that has never signed in, as the Admin Panel offers it; the
 *   server sent one for any account.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: () => true,
  sendWelcomeEmail: jest.fn(async () => undefined),
  sendInvitationEmail: jest.fn(async () => undefined),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma as appPrisma } from '../../config/database';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { sendInvitationEmail, sendWelcomeEmail } from '../../services/email';

const app = createTestApp();
const created: string[] = [];
let admin: request.Agent;

async function account(opts: Parameters<typeof createTestUser>[0] = {}) {
  const u = await createTestUser(opts);
  created.push(u.id);
  return u;
}

/** Accounts the routes made, found by address so they are removed too. */
async function forget(email: string) {
  const row = await prisma.user.findUnique({ where: { email } });
  if (row) created.push(row.id);
}

beforeAll(async () => {
  const a = await account({ role: 'ADMIN', displayName: 'Create input admin' });
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: a.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(sendWelcomeEmail).mockClear();
  jest.mocked(sendInvitationEmail).mockClear();
});

afterAll(async () => {
  try {
    await prisma.systemLog.deleteMany({ where: { userId: { in: created } } });
    await cleanupUsers(created);
  } finally {
    await prisma.$disconnect();
  }
});

describe.each([
  ['Create User', '/api/admin/users'],
  ['Invite User', '/api/admin/users/invite'],
])('%s', (_label, route) => {
  it('refuses an address with angle brackets, and creates nothing or sends nothing', async () => {
    const stripped = testEmail('angle');
    const typed = stripped.replace('@', '<x>@');

    const res = await admin.post(route).send({ email: typed });
    await forget(stripped);
    await forget(typed);

    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { email: stripped.replace('@', 'x@') } })).toBeNull();
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('answers 409 when the address is taken between the check and the write', async () => {
    const taken = await account();
    // The duplicate check finds nothing, as when another request creates the
    // account just after it.
    const findUnique = appPrisma.user.findUnique.bind(appPrisma.user);
    jest.spyOn(appPrisma.user, 'findUnique').mockImplementation(((args: { where: { email?: string } }) =>
      args.where.email === taken.email ? Promise.resolve(null) : findUnique(args as never)) as never);

    const res = await admin.post(route).send({ email: taken.email });

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Email is already in use');
  });

  it('refuses a display name that is empty once cleaned, or too long', async () => {
    for (const displayName of ['<>', 'x'.repeat(51)]) {
      const email = testEmail('badname');
      const res = await admin.post(route).send({ email, displayName });
      await forget(email);
      expect(res.status).toBe(400);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    }
  });

  it('stores a display name without bidirectional overrides, as sign-up does', async () => {
    const email = testEmail('bidiname');
    const res = await admin.post(route).send({ email, displayName: 'Bree\u202E Hollow\u200B' });
    await forget(email);

    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).displayName).toBe('Bree Hollow');
  });

  it('stores a display name as sign-up does, trimmed', async () => {
    const email = testEmail('goodname');
    const res = await admin.post(route).send({ email, displayName: '  Bree Hollow  ' });
    await forget(email);

    expect(res.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).displayName).toBe('Bree Hollow');
  });
});

describe('POST /api/admin/users/:id/resend-invite', () => {
  it('refuses an account that has signed in, and sends no link', async () => {
    const settled = await account();
    await prisma.user.update({ where: { id: settled.id }, data: { lastLoginAt: new Date() } });

    const res = await admin.post(`/api/admin/users/${settled.id}/resend-invite`);

    expect(res.status).toBe(409);
    // Names the button as the Admin Panel shows it.
    expect(res.body.message).toBe(
      'This account has already signed in, so there is no invitation to resend. Use Send Reset Link to email them a link to set a new password.'
    );
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId: settled.id } })).toBe(0);
  });

  it('sends a new link to an account that has never signed in', async () => {
    const invited = await account();

    expect((await admin.post(`/api/admin/users/${invited.id}/resend-invite`)).status).toBe(200);
    expect(sendInvitationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/users/:id email', () => {
  it('answers as for a taken address when it is taken between the check and the write', async () => {
    const target = await account();
    const taken = await account();
    jest.spyOn(appPrisma.user, 'findFirst').mockResolvedValueOnce(null);

    const res = await admin.put(`/api/users/${target.id}`).send({ email: taken.email });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email already in use');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).email).toBe(target.email);
  });
});
