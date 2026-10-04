/**
 * A profile's avatar address is the avatar route for that same user, or null.
 *
 * Every member's browser loads it, in the roster, chat and dashboard, and it
 * was stored exactly as sent: any string, a number (a 500) or an object. The
 * app only ever sends `/api/assets/avatars/<the user's id>`, after uploading
 * the picture, so that and null are what is accepted.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

describe('PUT /api/users/:id avatarUrl', () => {
  let adminId: string;
  let userId: string;
  let otherId: string;
  let adminAgent: ReturnType<typeof request.agent>;
  let userAgent: ReturnType<typeof request.agent>;

  async function login(email: string) {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return agent;
  }

  const storedAvatar = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, select: { avatarUrl: true } })).avatarUrl;

  beforeAll(async () => {
    const stamp = Date.now();
    const admin = await createTestUser({ email: `avatar_admin_${stamp}@test.invalid`, isApproved: true, role: 'ADMIN' });
    const user = await createTestUser({ email: `avatar_user_${stamp}@test.invalid`, isApproved: true });
    const other = await createTestUser({ email: `avatar_other_${stamp}@test.invalid`, isApproved: true });
    adminId = admin.id;
    userId = user.id;
    otherId = other.id;
    adminAgent = await login(admin.email);
    userAgent = await login(user.email);
  });

  afterEach(async () => {
    await prisma.user.updateMany({ where: { id: { in: [userId, otherId] } }, data: { avatarUrl: null } });
  });

  afterAll(async () => {
    await cleanupUsers([adminId, userId, otherId]);
    await prisma.$disconnect();
  });

  it('accepts the avatar address for the same user', async () => {
    const res = await userAgent.put(`/api/users/${userId}`).send({ avatarUrl: `/api/assets/avatars/${userId}` });

    expect(res.status).toBe(200);
    expect(await storedAvatar(userId)).toBe(`/api/assets/avatars/${userId}`);
  });

  it('accepts null, which clears it', async () => {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: `/api/assets/avatars/${userId}` } });

    const res = await userAgent.put(`/api/users/${userId}`).send({ avatarUrl: null });

    expect(res.status).toBe(200);
    expect(await storedAvatar(userId)).toBeNull();
  });

  it('lets an admin set the address for the user being edited', async () => {
    const res = await adminAgent.put(`/api/users/${otherId}`).send({ avatarUrl: `/api/assets/avatars/${otherId}` });

    expect(res.status).toBe(200);
    expect(await storedAvatar(otherId)).toBe(`/api/assets/avatars/${otherId}`);
  });

  it.each([
    ['an outside address', 'https://tracker.example/pixel.png'],
    ['another app path', '/api/auth/logout'],
    ["another user's avatar", 'OTHER'],
    ['an empty string', ''],
    ['a number', 42],
    ['an object', { set: '/x' }],
  ])('refuses %s with 400 and stores nothing', async (_label, value) => {
    const avatarUrl = value === 'OTHER' ? `/api/assets/avatars/${otherId}` : value;

    const res = await userAgent.put(`/api/users/${userId}`).send({ avatarUrl });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(await storedAvatar(userId)).toBeNull();
  });

  it('changes nothing else in a refused request', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });

    const res = await userAgent
      .put(`/api/users/${userId}`)
      .send({ displayName: 'Renamed In A Refused Request', avatarUrl: 'https://tracker.example/x.png' });

    expect(res.status).toBe(400);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
    expect(after.displayName).toBe(before.displayName);
  });
});
