/**
 * The Admin Dashboard's routes: only a platform admin reaches any of them, and
 * the account actions do what the dashboard says they do.
 *
 * The refusal is checked for every route mounted under /api/admin, read from
 * the router, so a route added there later is checked without being listed.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fsSync from 'fs';
import os from 'os';
import path from 'path';

// Read once, when the admin routes load; a folder of this file's own.
const BACKUP_DIR = fsSync.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-admin-routes-'));
process.env.BACKUP_DIR = BACKUP_DIR;

jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: jest.fn(() => false),
  sendWelcomeEmail: jest.fn(async () => undefined),
  sendInvitationEmail: jest.fn(async () => undefined),
  sendTestEmail: jest.fn(async () => undefined),
}));

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { mountedRoutes } from '../../__tests__/helpers/routeInventory';
import {
  prisma,
  createTestUser,
  cleanupUsers,
  testEmail,
  ensureLoginSessionTable,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';
import { hashResetToken } from '../../services/passwordResetTokens';
import { isSmtpConfigured, sendWelcomeEmail, sendInvitationEmail, sendTestEmail } from '../../services/email';

const smtpOn = isSmtpConfigured as jest.MockedFunction<typeof isSmtpConfigured>;
const welcomeEmail = sendWelcomeEmail as jest.MockedFunction<typeof sendWelcomeEmail>;
const invitationEmail = sendInvitationEmail as jest.MockedFunction<typeof sendInvitationEmail>;
const testEmailSent = sendTestEmail as jest.MockedFunction<typeof sendTestEmail>;

const app = createTestApp();
const created: string[] = [];
const sessionIds: string[] = [];

let adminId: string;
let adminEmail: string;
let userId: string;
let admin: request.Agent;
let user: request.Agent;

async function signIn(email: string): Promise<request.Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function account(opts: Parameters<typeof createTestUser>[0] = {}) {
  const u = await createTestUser(opts);
  created.push(u.id);
  return u;
}

/** Accounts the routes created, found by address so they are cleaned up too. */
async function forget(email: string): Promise<void> {
  const row = await prisma.user.findUnique({ where: { email } });
  if (row) created.push(row.id);
}

beforeAll(async () => {
  const a = await account({ role: 'ADMIN', displayName: 'Admin routes admin' });
  const u = await account({ displayName: 'Admin routes user' });
  adminId = a.id;
  adminEmail = a.email;
  userId = u.id;
  admin = await signIn(a.email);
  user = await signIn(u.email);
});

beforeEach(() => {
  smtpOn.mockReturnValue(false);
  welcomeEmail.mockReset().mockResolvedValue(undefined);
  invitationEmail.mockReset().mockResolvedValue(undefined);
  testEmailSent.mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  try {
    if (sessionIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM session WHERE sid = ANY(${sessionIds})`;
    }
    await prisma.systemLog.deleteMany({ where: { userId: adminId } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: created } } });
    await cleanupUsers(created);
  } finally {
    await prisma.$disconnect();
    fsSync.rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
});

describe('every admin route', () => {
  const adminRoutes = mountedRoutes(createTestApp()).filter((r) => r.path.startsWith('/api/admin/'));
  const call = (agent: request.SuperTest<request.Test> | request.Agent, method: string, url: string) => {
    const concrete = url.replace(/:id\b/, userId).replace(/:filename\b/, 'backup-2026-01-01T00-00-00.zip');
    switch (method) {
      case 'GET':
        return agent.get(concrete);
      case 'POST':
        return agent.post(concrete).send({});
      case 'PUT':
        return agent.put(concrete).send({});
      case 'DELETE':
        return agent.delete(concrete);
      default:
        throw new Error(`No case for ${method}`);
    }
  };

  it('is found on the router', () => {
    expect(adminRoutes.length).toBeGreaterThanOrEqual(16);
  });

  it.each(adminRoutes.map((r) => [`${r.method} ${r.path}`, r.method, r.path]))(
    '%s refuses a user who is not an admin, and a caller who is not signed in',
    async (_label, method, url) => {
      const asUser = await call(user, method, url);
      expect(asUser.status).toBe(403);
      const anonymous = await call(request(app), method, url);
      expect(anonymous.status).toBe(401);
    }
  );

  it('GET /api/campaigns/admin/all, which lives with the campaigns, is the admin\'s alone too', async () => {
    expect((await user.get('/api/campaigns/admin/all')).status).toBe(403);
    expect((await request(app).get('/api/campaigns/admin/all')).status).toBe(401);
    const res = await admin.get('/api/campaigns/admin/all');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.campaigns)).toBe(true);
  });
});

describe('GET /api/admin/stats', () => {
  it('counts what the instance holds', async () => {
    const res = await admin.get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.userCount).toBeGreaterThanOrEqual(2);
    for (const field of ['campaignCount', 'activeSessionCount', 'characterCount', 'mapCount', 'totalStorageBytes']) {
      expect(typeof res.body[field]).toBe('number');
    }
    expect(Array.isArray(res.body.assetBreakdown)).toBe(true);
  });

  // No per-user quota is enforced; the dashboard warns once the disk is over 80% full.
  it('says how full the disk holding the uploads is', async () => {
    const res = await admin.get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.uploadsDisk).toEqual({
      totalBytes: expect.any(Number),
      freeBytes: expect.any(Number),
      usedPercent: expect.any(Number),
      warning: expect.any(Boolean),
    });
    expect(res.body.uploadsDisk.warning).toBe(res.body.uploadsDisk.usedPercent > 80);
  });
});

describe('GET /api/admin/activity', () => {
  it('shows who is signed in and what admins have done', async () => {
    await ensureLoginSessionTable();
    const sid = `admin-routes-${adminId}`;
    sessionIds.push(sid);
    await prisma.$executeRaw`
      INSERT INTO session (sid, sess, expire)
      VALUES (${sid}, ${JSON.stringify({ userId: adminId })}::json, NOW() + INTERVAL '1 hour')
    `;
    const pending = await account({ isApproved: false });
    expect((await admin.post(`/api/admin/users/${pending.id}/approve`)).status).toBe(200);

    const res = await admin.get('/api/admin/activity');

    expect(res.status).toBe(200);
    expect(res.body.onlineUsers.map((u: { id: string }) => u.id)).toContain(adminId);
    expect(res.body.recentLogs.map((l: { message: string }) => l.message)).toContain(
      `Approved account for user ${pending.email}`
    );
  });
});

describe('POST /api/admin/users', () => {
  it('creates an account that must change its password, and shows the password when no email can be sent', async () => {
    const email = testEmail('admincreate');
    const res = await admin.post('/api/admin/users').send({ email, displayName: 'Made by admin' });
    await forget(email);

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(false);
    expect(res.body.temporaryPassword).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.mustChangePassword).toBe(true);
    expect(stored.platformRole).toBe('USER');
  });

  it('emails the password instead of showing it when the instance can send email', async () => {
    smtpOn.mockReturnValue(true);
    const email = testEmail('admincreatemail');
    const res = await admin.post('/api/admin/users').send({ email });
    await forget(email);

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(res.body).not.toHaveProperty('temporaryPassword');
    expect(welcomeEmail).toHaveBeenCalledTimes(1);
  });

  it('refuses an address in use, and one that is not an address', async () => {
    expect((await admin.post('/api/admin/users').send({ email: adminEmail })).status).toBe(409);
    expect((await admin.post('/api/admin/users').send({ email: 'not-an-address' })).status).toBe(400);
    expect((await admin.post('/api/admin/users').send({})).status).toBe(400);
  });
});

describe('POST /api/admin/users/invite', () => {
  it('needs the instance to send email', async () => {
    const res = await admin.post('/api/admin/users/invite').send({ email: testEmail('invitenosmtp') });
    expect(res.status).toBe(503);
  });

  it('creates an account nobody holds a password for, and emails a link valid for seven days', async () => {
    smtpOn.mockReturnValue(true);
    const email = testEmail('invite');
    const res = await admin.post('/api/admin/users/invite').send({ email });
    await forget(email);

    expect(res.status).toBe(201);
    expect(res.body.expiresInDays).toBe(7);
    expect(invitationEmail).toHaveBeenCalledTimes(1);
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.mustChangePassword).toBe(false);
    // The row holds the hash of the token the email carries.
    const tokens = await prisma.passwordResetToken.findMany({ where: { userId: stored.id, used: false } });
    expect(tokens.map((t) => t.token)).toEqual([hashResetToken(invitationEmail.mock.calls[0][1] as string)]);
  });

  it('removes the account again when the invitation cannot be sent', async () => {
    smtpOn.mockReturnValue(true);
    invitationEmail.mockRejectedValue(new Error('SMTP down'));
    const email = testEmail('invitefail');
    const res = await admin.post('/api/admin/users/invite').send({ email });
    await forget(email);

    expect(res.status).toBe(502);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});

describe('POST /api/admin/users/:id/resend-invite', () => {
  it('sends a new link and voids the old one', async () => {
    smtpOn.mockReturnValue(true);
    const invited = await account();
    await prisma.passwordResetToken.create({
      data: { userId: invited.id, token: `old-invite-${invited.id}`, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    const res = await admin.post(`/api/admin/users/${invited.id}/resend-invite`);

    expect(res.status).toBe(200);
    const live = await prisma.passwordResetToken.findMany({ where: { userId: invited.id, used: false } });
    expect(live.map((t) => t.token)).toEqual([hashResetToken(invitationEmail.mock.calls[0][1] as string)]);
  });

  it('needs the instance to send email, and an account to send to', async () => {
    expect((await admin.post(`/api/admin/users/${userId}/resend-invite`)).status).toBe(503);
    smtpOn.mockReturnValue(true);
    expect((await admin.post('/api/admin/users/00000000-0000-4000-8000-000000000000/resend-invite')).status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/approve', () => {
  it('approves an account waiting for it, once', async () => {
    const pending = await account({ isApproved: false });
    expect((await admin.post(`/api/admin/users/${pending.id}/approve`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.id } })).isApproved).toBe(true);
    expect((await admin.post(`/api/admin/users/${pending.id}/approve`)).status).toBe(400);
    expect((await admin.post('/api/admin/users/00000000-0000-4000-8000-000000000000/approve')).status).toBe(404);
  });
});

describe('POST /api/admin/users/:id/reset-mfa', () => {
  it('turns two-factor sign-in off and clears its secret and backup codes', async () => {
    const locked = await account();
    await prisma.user.update({
      where: { id: locked.id },
      data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP', mfaBackupCodes: ['hash'] },
    });

    expect((await admin.post(`/api/admin/users/${locked.id}/reset-mfa`)).status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: locked.id } });
    expect(stored.mfaEnabled).toBe(false);
    expect(stored.mfaSecret).toBeNull();
    expect(stored.mfaBackupCodes).toEqual([]);
    expect((await admin.post(`/api/admin/users/${locked.id}/reset-mfa`)).status).toBe(400);
  });
});

describe('POST /api/admin/smtp/test', () => {
  it('sends a test email to the admin who asked', async () => {
    smtpOn.mockReturnValue(true);
    const res = await admin.post('/api/admin/smtp/test');
    expect(res.status).toBe(200);
    expect(testEmailSent).toHaveBeenCalledWith(adminEmail, 'Admin routes admin');
  });

  it('says so when email is not set up', async () => {
    expect((await admin.post('/api/admin/smtp/test')).status).toBe(400);
    expect(testEmailSent).not.toHaveBeenCalled();
  });
});

describe('downloading and deleting a backup', () => {
  const name = 'backup-2026-01-02T03-04-05.zip';

  it('downloads a backup, then deletes it', async () => {
    fsSync.writeFileSync(path.join(BACKUP_DIR, name), 'zip bytes');

    const download = await admin.get(`/api/admin/backups/${name}/download`).buffer(true);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain(name);

    expect((await admin.delete(`/api/admin/backups/${name}`)).status).toBe(200);
    expect(fsSync.existsSync(path.join(BACKUP_DIR, name))).toBe(false);
  });

  it('answers 404 for a backup that is not there', async () => {
    expect((await admin.get(`/api/admin/backups/${name}/download`)).status).toBe(404);
    expect((await admin.delete(`/api/admin/backups/${name}`)).status).toBe(404);
  });

  it('refuses a name that is not a backup\'s, so nothing outside the folder is reached', async () => {
    fsSync.writeFileSync(path.join(BACKUP_DIR, 'notes.txt'), 'keep');
    expect((await admin.get('/api/admin/backups/notes.txt/download')).status).toBe(400);
    expect((await admin.delete('/api/admin/backups/notes.txt')).status).toBe(400);
    expect((await admin.get('/api/admin/backups/..%2F..%2Fetc%2Fpasswd/download')).status).toBe(400);
    expect(fsSync.existsSync(path.join(BACKUP_DIR, 'notes.txt'))).toBe(true);
  });
});
