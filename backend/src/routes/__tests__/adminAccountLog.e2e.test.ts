/**
 * What an administrator does to someone's account is written to the admins'
 * activity log (Admin → Activity), with who did it, whose account it was and
 * what changed.
 *
 * Creating, inviting, approving, a role change and the resets were written
 * there; granting Global Assets or template editing, changing someone else's
 * email address or name, deleting an account and sending a reset link were
 * not, so on an instance with several administrators nobody could tell who
 * had done them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

jest.mock('express-rate-limit', () => {
  return () => (_req: Request, _res: Response, next: NextFunction) => next();
});
jest.mock('../../services/email', () => ({
  ...jest.requireActual('../../services/email'),
  isSmtpConfigured: () => true,
  sendPasswordResetEmail: () => Promise.resolve(),
  sendEmailChangedNotice: () => Promise.resolve(),
}));

import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const created: string[] = [];

async function account(label: string, role: 'ADMIN' | 'USER' = 'USER') {
  const user = await createTestUser({ email: `adminlog-${label}-${stamp}@test.cozyvtt.local`, displayName: `Log ${label}`, role });
  created.push(user.id);
  return user;
}

async function signedInAdmin(label: string) {
  const user = await account(label, 'ADMIN');
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** The activity-log rows naming this account as their target. */
async function rowsAbout(targetUserId: string) {
  return prisma.systemLog.findMany({
    where: { context: { path: ['targetUserId'], equals: targetUserId } },
    orderBy: { createdAt: 'asc' },
  });
}

afterAll(async () => {
  await prisma.systemLog.deleteMany({ where: { userId: { in: created } } });
  await prisma.systemLog.deleteMany({ where: { message: { contains: stamp } } });
  await cleanupUsers(created);
  await prisma.$disconnect();
});

describe('PUT /api/users/:id by an administrator', () => {
  it('writes granting and taking away Global Assets, with the value before and after', async () => {
    const { user: admin, agent } = await signedInAdmin('grant-assets');
    const target = await account('grant-assets-target');

    expect((await agent.put(`/api/users/${target.id}`).send({ globalAssetManager: true })).status).toBe(200);
    expect((await agent.put(`/api/users/${target.id}`).send({ globalAssetManager: false })).status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].userId).toBe(admin.id);
    expect(rows[0].message).toContain(target.email);
    expect(rows[0].message).toMatch(/Global Assets/);
    expect(rows[0].context).toMatchObject({ changes: { globalAssetManager: { from: false, to: true } } });
    expect(rows[1].context).toMatchObject({ changes: { globalAssetManager: { from: true, to: false } } });
  });

  it('writes granting template editing', async () => {
    const { agent } = await signedInAdmin('grant-templates');
    const target = await account('grant-templates-target');

    expect((await agent.put(`/api/users/${target.id}`).send({ templateEditor: true })).status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].context).toMatchObject({ changes: { templateEditor: { from: false, to: true } } });
  });

  it("writes changing someone else's email address and name, old and new", async () => {
    const { agent } = await signedInAdmin('change-email');
    const target = await account('change-email-target');
    const newEmail = `adminlog-moved-${stamp}@test.cozyvtt.local`;

    const res = await agent.put(`/api/users/${target.id}`).send({ email: newEmail, displayName: 'Renamed' });
    expect(res.status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].level).toBe('WARNING');
    expect(rows[0].context).toMatchObject({
      changes: {
        email: { from: target.email, to: newEmail },
        displayName: { from: 'Log change-email-target', to: 'Renamed' },
      },
    });
  });

  it("writes that someone else's bio changed, and not what it said before or after", async () => {
    const { agent } = await signedInAdmin('change-bio');
    const target = await account('change-bio-target');
    await prisma.user.update({ where: { id: target.id }, data: { bio: 'Likes dragons, afraid of owlbears' } });
    const newEmail = `adminlog-bio-moved-${stamp}@test.cozyvtt.local`;

    expect((await agent.put(`/api/users/${target.id}`).send({ bio: 'Moved to Lisbon in March' })).status).toBe(200);
    // Clearing it is a change too, and the other fields keep their values.
    expect((await agent.put(`/api/users/${target.id}`).send({ bio: null, email: newEmail })).status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].message).toContain('bio changed');
    expect(rows[0].context).toMatchObject({ changes: { bio: { changed: true } } });
    expect(rows[1].context).toMatchObject({
      changes: { bio: { changed: true }, email: { from: target.email, to: newEmail } },
    });
    // Neither the text that was there nor the text that replaced it is stored.
    const stored = JSON.stringify(rows.map((row) => [row.message, row.context]));
    expect(stored).not.toMatch(/dragons|owlbears|Lisbon/);
    expect((rows[0].context as { changes: { bio: object } }).changes.bio).toEqual({ changed: true });
  });

  it('writes nothing when a bio is saved as it was', async () => {
    const { agent } = await signedInAdmin('same-bio');
    const target = await account('same-bio-target');
    await prisma.user.update({ where: { id: target.id }, data: { bio: 'Unchanged' } });

    expect((await agent.put(`/api/users/${target.id}`).send({ bio: 'Unchanged' })).status).toBe(200);

    expect(await rowsAbout(target.id)).toHaveLength(0);
  });

  it('writes nothing when an administrator saves the same values again', async () => {
    const { agent } = await signedInAdmin('no-change');
    const target = await account('no-change-target');

    const res = await agent.put(`/api/users/${target.id}`).send({ email: target.email, globalAssetManager: false });
    expect(res.status).toBe(200);

    expect(await rowsAbout(target.id)).toHaveLength(0);
  });
});

describe('PUT /api/users/:id by the account itself', () => {
  it('writes nothing for an ordinary profile edit', async () => {
    const self = await account('self-edit');
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ email: self.email, password: TEST_PASSWORD })).status).toBe(200);

    expect((await agent.put(`/api/users/${self.id}`).send({ displayName: 'Self Renamed' })).status).toBe(200);

    expect(await rowsAbout(self.id)).toHaveLength(0);
  });
});

describe('DELETE /api/users/:id', () => {
  it('writes the deletion, naming the account that went', async () => {
    const { user: admin, agent } = await signedInAdmin('delete');
    const target = await account('delete-target');

    expect((await agent.delete(`/api/users/${target.id}`)).status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(admin.id);
    expect(rows[0].level).toBe('WARNING');
    expect(rows[0].message).toContain(target.email);
  });
});

describe('POST /api/users/:id/send-reset-link', () => {
  it('writes the reset link sent', async () => {
    const { user: admin, agent } = await signedInAdmin('reset-link');
    const target = await account('reset-link-target');

    expect((await agent.post(`/api/users/${target.id}/send-reset-link`)).status).toBe(200);

    const rows = await rowsAbout(target.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(admin.id);
    expect(rows[0].message).toContain(target.email);
  });
});

describe('GET /api/admin/activity', () => {
  /** The Activity tab's line about this account. */
  async function lineAbout(agent: ReturnType<typeof request.agent>, targetUserId: string) {
    const res = await agent.get('/api/admin/activity');
    expect(res.status).toBe(200);
    const logs: { userId: string | null; context: { targetUserId?: string } | null; actor?: unknown }[] = res.body.recentLogs;
    return logs.find((log) => log.context?.targetUserId === targetUserId);
  }

  it('names the administrator who acted on each line', async () => {
    const { user: admin, agent } = await signedInAdmin('activity-actor');
    const target = await account('activity-actor-target');

    expect((await agent.put(`/api/users/${target.id}`).send({ globalAssetManager: true })).status).toBe(200);

    const line = await lineAbout(agent, target.id);
    expect(line).toBeDefined();
    expect(line?.actor).toEqual({ id: admin.id, email: admin.email, displayName: 'Log activity-actor' });
  });

  it("keeps the line when the administrator's account is deleted, with no one named", async () => {
    const { user: gone, agent: goneAgent } = await signedInAdmin('activity-gone');
    const { agent } = await signedInAdmin('activity-remover');
    const target = await account('activity-gone-target');

    expect((await goneAgent.put(`/api/users/${target.id}`).send({ templateEditor: true })).status).toBe(200);
    expect((await agent.delete(`/api/users/${gone.id}`)).status).toBe(200);

    const line = await lineAbout(agent, target.id);
    expect(line).toBeDefined();
    expect(line?.userId).toBe(gone.id);
    expect(line?.actor).toBeNull();
  });

  it("names no one on the instance's own lines", async () => {
    const { agent } = await signedInAdmin('activity-instance');
    const row = await prisma.systemLog.create({
      data: { level: 'WARNING', message: `Instance line ${stamp}`, userId: null },
    });

    const res = await agent.get('/api/admin/activity');
    const line = (res.body.recentLogs as { id: string; actor?: unknown }[]).find((log) => log.id === row.id);
    expect(line).toBeDefined();
    expect(line?.actor).toBeNull();
  });
});
