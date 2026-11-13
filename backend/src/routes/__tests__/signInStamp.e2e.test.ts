/**
 * When an account last signed in, and what is decided from it.
 *
 * `lastLoginAt` is stamped when a sign-in completes: a password sign-in, the
 * code step of a two-factor one, and a registration that signs the person
 * in. Only the password route stamped it, at the password step, so a
 * sign-in that stopped at the code step was stamped and a registered account
 * never was. The Admin Panel showed such accounts as never signed in, and two
 * things that are only for an account nobody has used went ahead for them:
 * Resend Invite, and the fresh 7 days an invited administrator gets to set
 * up two-factor authentication. The setup wizard's administrator is covered
 * in setupWizard.e2e.test.ts, which runs on an empty database.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: () => true,
  sendInvitationEmail: jest.fn(async () => undefined),
}));

import request from 'supertest';
import { generateSecret, generateSync } from 'otplib';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, testEmail, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import * as systemSettings from '../../services/systemSettings';
import { hashResetToken } from '../../services/passwordResetTokens';
import { sendInvitationEmail } from '../../services/email';

const app = createTestApp();
const created: string[] = [];
const DAY = 24 * 60 * 60 * 1000;
let admin: request.Agent;

const stampOf = async (id: string): Promise<Date | null> =>
  (await prisma.user.findUniqueOrThrow({ where: { id }, select: { lastLoginAt: true } })).lastLoginAt;

/** Registration open, with or without admin approval, whatever the shared database's settings say. */
function registrationOpen(requireAdminApproval: boolean): void {
  const stored = systemSettings.getSystemSettings;
  jest.spyOn(systemSettings, 'getSystemSettings').mockImplementation(async () => ({
    ...(await stored()),
    allowRegistration: true,
    requireAdminApproval,
  }));
}

/** Register through the route, and return the account it made. */
async function register(label: string, requireAdminApproval = false) {
  registrationOpen(requireAdminApproval);
  const email = testEmail(label);
  const res = await request(app).post('/api/auth/register').send({ email, password: TEST_PASSWORD, displayName: 'Rowan Thistle' });
  const row = await prisma.user.findUniqueOrThrow({ where: { email } });
  created.push(row.id);
  expect(res.status).toBe(201);
  return row;
}

beforeAll(async () => {
  const a = await createTestUser({ role: 'ADMIN', displayName: 'Stamp admin' });
  created.push(a.id);
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: a.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(sendInvitationEmail).mockClear();
});

afterAll(async () => {
  await prisma.systemLog.deleteMany({ where: { userId: { in: created } } });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('registering', () => {
  it('stamps an account that registers and is signed in', async () => {
    const user = await register('stamp_register');
    expect(await stampOf(user.id)).not.toBeNull();
  });

  it('leaves an account waiting for approval unstamped, since nobody is signed in', async () => {
    const user = await register('stamp_pending', true);
    expect(await stampOf(user.id)).toBeNull();
  });
});

describe('signing in', () => {
  it('stamps a password sign-in', async () => {
    const user = await createTestUser({ displayName: 'Stamp password' });
    created.push(user.id);

    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    expect(await stampOf(user.id)).not.toBeNull();
  });

  it('leaves the stamp alone when the account is still waiting for approval', async () => {
    const user = await createTestUser({ displayName: 'Stamp unapproved', isApproved: false });
    created.push(user.id);

    expect((await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(403);
    expect(await stampOf(user.id)).toBeNull();
  });

  it('leaves the stamp empty while a two-factor sign-in waits for its code, and stamps it when the code completes it', async () => {
    const secret = generateSecret();
    const user = await createTestUser({ displayName: 'Stamp two-factor' });
    created.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: secret } });
    const agent = request.agent(app);

    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.mfaRequired).toBe(true);
    expect(await stampOf(user.id)).toBeNull();

    expect((await agent.post('/api/auth/mfa/verify-login').send({ token: generateSync({ secret }) })).status).toBe(200);
    expect(await stampOf(user.id)).not.toBeNull();
  });
});

describe('Resend Invite', () => {
  it('is refused for an account that registered, and sends no link', async () => {
    const user = await register('stamp_resend');

    const res = await admin.post(`/api/admin/users/${user.id}/resend-invite`);

    expect(res.status).toBe(409);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('an invitation link', () => {
  it('does not start an administrator\'s two-factor days again once the account has registered', async () => {
    const user = await register('stamp_grace');
    await prisma.user.update({ where: { id: user.id }, data: { platformRole: 'ADMIN' } });
    // A link that lasts as long as an invitation, issued yesterday.
    const token = `invite-${user.id}`;
    const issued = new Date(Date.now() - DAY);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: hashResetToken(token), createdAt: issued, expiresAt: new Date(issued.getTime() + 7 * DAY) },
    });

    const res = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Rowan-Str0ng-Passw0rd!' });

    expect(res.status).toBe(200);
    expect(await prisma.systemLog.count({ where: { message: { startsWith: `${user.email} accepted an invitation` } } })).toBe(0);
  });
});

/**
 * An account signed in before its sign-in was stamped (the setup wizard's
 * administrator, anyone who registered) keeps an empty stamp until its owner
 * next signs in, which can be the whole remember-me window away. The read
 * every page makes at load, GET /api/auth/me, stamps it instead.
 */
describe('an account already in use with no stamp', () => {
  /** Signed in, with the stamp emptied as an account from before it was set at registration has it. */
  async function inUseUnstamped(label: string) {
    const user = await createTestUser({ displayName: label });
    created.push(user.id);
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: null } });
    return { user, agent };
  }

  it('is stamped once, by the next GET /api/auth/me', async () => {
    const { user, agent } = await inUseUnstamped('Stamp in use');

    const first = await agent.get('/api/auth/me');
    expect(first.status).toBe(200);
    const stamped = await stampOf(user.id);
    expect(stamped).not.toBeNull();
    expect(first.body.user.lastLoginAt).toBe(stamped?.toISOString());

    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(await stampOf(user.id)).toEqual(stamped);
  });

  it('is not stamped by a request with no session, or one still waiting for its code', async () => {
    const secret = generateSecret();
    const user = await createTestUser({ displayName: 'Stamp no session' });
    created.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: secret } });
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).body.mfaRequired).toBe(true);

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(await stampOf(user.id)).toBeNull();
  });

  it('is refused Resend Invite once stamped', async () => {
    const { user, agent } = await inUseUnstamped('Stamp in use resend');
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    expect((await admin.post(`/api/admin/users/${user.id}/resend-invite`)).status).toBe(409);
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('still gets its user when the stamp cannot be written, and is stamped by a later read', async () => {
    const { user, agent } = await inUseUnstamped('Stamp in use failing');
    jest.spyOn(appPrisma.user, 'updateMany').mockRejectedValueOnce(new Error('the database stopped answering'));

    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(await stampOf(user.id)).toBeNull();
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(await stampOf(user.id)).not.toBeNull();
  });
});

describe('a stamp that cannot be written at sign-in', () => {
  it('does not stop the sign-in, and the next GET /api/auth/me stamps the account', async () => {
    const user = await createTestUser({ displayName: 'Stamp failing' });
    created.push(user.id);
    const write = jest.spyOn(appPrisma.user, 'update').mockRejectedValueOnce(new Error('the database stopped answering'));
    const agent = request.agent(app);

    expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ where: { id: user.id }, data: { lastLoginAt: expect.any(Date) } }));
    expect(await stampOf(user.id)).toBeNull();

    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(await stampOf(user.id)).not.toBeNull();
  });
});
