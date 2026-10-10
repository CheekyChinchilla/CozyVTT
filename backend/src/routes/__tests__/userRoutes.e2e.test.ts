/**
 * The account routes that read a user and their preferences, and the admin's
 * "send a reset link" action: who may call each, and what comes back.
 *
 * GET /api/users/:id answers a user about themselves and an admin about
 * anyone. Any other caller is refused, because the answer carries the email
 * address and role. No answer carries a password hash, MFA secret or backup
 * code.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: jest.fn(() => false),
  sendPasswordResetEmail: jest.fn(async () => undefined),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { isSmtpConfigured, sendPasswordResetEmail } from '../../services/email';

const smtpOn = isSmtpConfigured as jest.MockedFunction<typeof isSmtpConfigured>;
const sentResetEmail = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>;

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

let adminId: string;
let userId: string;
let otherId: string;
let admin: request.Agent;
let user: request.Agent;

const SECRET_FIELDS = ['passwordHash', 'mfaSecret', 'mfaBackupCodes'];

async function signIn(email: string): Promise<request.Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const a = await createTestUser({ email: `userroutes-admin-${stamp}@test.cozyvtt.local`, role: 'ADMIN' });
  const u = await createTestUser({ email: `userroutes-user-${stamp}@test.cozyvtt.local` });
  const o = await createTestUser({ email: `userroutes-other-${stamp}@test.cozyvtt.local` });
  adminId = a.id;
  userId = u.id;
  otherId = o.id;
  created.push(adminId, userId, otherId);
  // Something to leak, if anything did.
  await prisma.user.update({
    where: { id: otherId },
    data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: ['hash-one'] },
  });
  admin = await signIn(a.email);
  user = await signIn(u.email);
});

beforeEach(() => {
  smtpOn.mockReturnValue(false);
  sentResetEmail.mockClear();
});

afterAll(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: created } } });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('GET /api/users', () => {
  it('lists every account for an admin, without secrets', async () => {
    const res = await admin.get('/api/users');
    expect(res.status).toBe(200);
    const listed = res.body.users as Array<Record<string, unknown>>;
    expect(listed.map((u) => u.id)).toEqual(expect.arrayContaining([adminId, userId, otherId]));
    for (const field of SECRET_FIELDS) {
      expect(listed.some((u) => field in u)).toBe(false);
    }
  });

  it('refuses a user who is not an admin', async () => {
    expect((await user.get('/api/users')).status).toBe(403);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);
  });
});

describe('GET /api/users/:id', () => {
  it('answers a user about themselves', async () => {
    const res = await user.get(`/api/users/${userId}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(userId);
    for (const field of SECRET_FIELDS) expect(res.body.user).not.toHaveProperty(field);
  });

  it('refuses a user asking about someone else, and says nothing about them', async () => {
    const res = await user.get(`/api/users/${otherId}`);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('userroutes-other');
  });

  it('answers an admin about anyone, without secrets', async () => {
    const res = await admin.get(`/api/users/${otherId}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(`userroutes-other-${stamp}@test.cozyvtt.local`);
    for (const field of SECRET_FIELDS) expect(res.body.user).not.toHaveProperty(field);
  });

  it('tells an admin when there is no such user', async () => {
    expect((await admin.get('/api/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await request(app).get(`/api/users/${userId}`)).status).toBe(401);
  });
});

describe('the preferences routes', () => {
  afterEach(async () => {
    await prisma.user.updateMany({ where: { id: { in: [userId, otherId] } }, data: { preferences: {} } });
  });

  it('give a user their own preferences, empty to begin with', async () => {
    const res = await user.get(`/api/users/${userId}/preferences`);
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({});
  });

  it('merge a change into what is stored', async () => {
    await user.put(`/api/users/${userId}/preferences`).send({ themeId: 'ocean-depths' });
    const res = await user.put(`/api/users/${userId}/preferences`).send({ fontId: 'gothic' });
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({ themeId: 'ocean-depths', fontId: 'gothic' });
    expect((await user.get(`/api/users/${userId}/preferences`)).body.preferences).toEqual({
      themeId: 'ocean-depths',
      fontId: 'gothic',
    });
  });

  it('refuse a value the app does not offer, and an empty change', async () => {
    expect((await user.put(`/api/users/${userId}/preferences`).send({ themeId: 'not-a-theme' })).status).toBe(400);
    expect((await user.put(`/api/users/${userId}/preferences`).send({})).status).toBe(400);
  });

  it('drop fields the app does not have', async () => {
    const res = await user.put(`/api/users/${userId}/preferences`).send({ fontId: 'clean', isAdmin: true });
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({ fontId: 'clean' });
  });

  it('refuse a user reading or changing someone else\'s', async () => {
    expect((await user.get(`/api/users/${otherId}/preferences`)).status).toBe(403);
    expect((await user.put(`/api/users/${otherId}/preferences`).send({ fontId: 'gothic' })).status).toBe(403);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: otherId }, select: { preferences: true } });
    expect(stored.preferences).toEqual({});
  });

  it('let an admin read and change anyone\'s', async () => {
    expect((await admin.put(`/api/users/${otherId}/preferences`).send({ fontId: 'modern' })).status).toBe(200);
    const res = await admin.get(`/api/users/${otherId}/preferences`);
    expect(res.status).toBe(200);
    expect(res.body.preferences).toEqual({ fontId: 'modern' });
  });

  it('refuse a caller who is not signed in', async () => {
    expect((await request(app).get(`/api/users/${userId}/preferences`)).status).toBe(401);
    expect((await request(app).put(`/api/users/${userId}/preferences`).send({ fontId: 'gothic' })).status).toBe(401);
  });
});

describe('POST /api/users/:id/send-reset-link', () => {
  it('emails the user a fresh link and voids the ones before it', async () => {
    smtpOn.mockReturnValue(true);
    await prisma.passwordResetToken.create({
      data: { userId: otherId, token: `old-${stamp}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const res = await admin.post(`/api/users/${otherId}/send-reset-link`);

    expect(res.status).toBe(200);
    expect(sentResetEmail).toHaveBeenCalledTimes(1);
    const [to, token] = sentResetEmail.mock.calls[0];
    expect(to).toBe(`userroutes-other-${stamp}@test.cozyvtt.local`);
    const live = await prisma.passwordResetToken.findMany({ where: { userId: otherId, used: false } });
    expect(live.map((t) => t.token)).toEqual([token]);
  });

  it('says so when the instance cannot send email', async () => {
    const res = await admin.post(`/api/users/${otherId}/send-reset-link`);
    expect(res.status).toBe(503);
    expect(sentResetEmail).not.toHaveBeenCalled();
  });

  it('tells the admin when there is no such user', async () => {
    smtpOn.mockReturnValue(true);
    expect((await admin.post('/api/users/00000000-0000-4000-8000-000000000000/send-reset-link')).status).toBe(404);
  });

  it('refuses a user who is not an admin, sending nothing', async () => {
    smtpOn.mockReturnValue(true);
    expect((await user.post(`/api/users/${otherId}/send-reset-link`)).status).toBe(403);
    expect((await request(app).post(`/api/users/${otherId}/send-reset-link`)).status).toBe(401);
    expect(sentResetEmail).not.toHaveBeenCalled();
  });
});
