/**
 * Replacing or removing an avatar leaves no earlier picture to be served.
 *
 * Every avatar upload added a picture and none was ever removed, and the
 * avatar route served the newest one to everyone signed in, whatever the
 * profile said. Deleting the newest from the asset library brought the one
 * before it back as the person's avatar, and an avatar could not be cleared.
 * Now a new avatar deletes the ones before it, clearing the avatar deletes
 * them all, the route serves nothing while the profile has no avatar, and
 * deleting the picture from the library clears the profile's avatar.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-avatar-replace-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// Magic-byte sniffing is stubbed, as in the other upload suites.
jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
  fileTypeFromBuffer: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

/** A tiny valid PNG. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

const users: string[] = [];

afterAll(async () => {
  await prisma.character.deleteMany({ where: { userId: { in: users } } });
  await prisma.asset.deleteMany({ where: { uploadedById: { in: users } } });
  await cleanupUsers(users);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

async function signedIn(): Promise<{ id: string; agent: request.Agent }> {
  const user = await createTestUser({ displayName: 'Avatar Replacer' });
  users.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { id: user.id, agent };
}

/** Upload an avatar and point the profile at it, as the Profile page does. */
async function setAvatar(user: { id: string; agent: request.Agent }): Promise<{ id: string; filePath: string }> {
  const res = await user.agent
    .post('/api/assets/upload')
    .field('type', 'AVATAR')
    .field('scope', 'USER')
    .attach('file', PNG, 'avatar.png');
  expect(res.status).toBe(201);
  const put = await user.agent.put(`/api/users/${user.id}`).send({ avatarUrl: `/api/assets/avatars/${user.id}` });
  expect(put.status).toBe(200);
  return prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id }, select: { id: true, filePath: true } });
}

const avatarsOf = (userId: string) => prisma.asset.findMany({ where: { uploadedById: userId, type: 'AVATAR' }, select: { id: true } });

describe('a new avatar', () => {
  it('deletes the one before it, row and file', async () => {
    const user = await signedIn();
    const first = await setAvatar(user);
    const second = await setAvatar(user);

    expect((await avatarsOf(user.id)).map((a) => a.id)).toEqual([second.id]);
    expect(fs.existsSync(first.filePath)).toBe(false);
    expect(fs.existsSync(second.filePath)).toBe(true);
  });

  it('keeps an earlier picture that something else still uses', async () => {
    const user = await signedIn();
    const first = await setAvatar(user);
    await prisma.character.create({
      data: { userId: user.id, name: 'Uses the old picture', data: {}, tokenImageUrl: `/api/assets/tokens/${first.id}` },
    });
    const second = await setAvatar(user);

    expect((await avatarsOf(user.id)).map((a) => a.id).sort()).toEqual([first.id, second.id].sort());
  });
});

describe('GET /api/assets/avatars/:userId', () => {
  it('serves nothing while the profile has no avatar, whatever pictures are stored', async () => {
    const user = await signedIn();
    await setAvatar(user);
    expect((await user.agent.get(`/api/assets/avatars/${user.id}`)).status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    expect((await user.agent.get(`/api/assets/avatars/${user.id}`)).status).toBe(404);
  });
});

describe('clearing the avatar', () => {
  it('deletes the pictures, rows and files', async () => {
    const user = await signedIn();
    const avatar = await setAvatar(user);

    const res = await user.agent.put(`/api/users/${user.id}`).send({ avatarUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.user.avatarUrl).toBeNull();
    expect(await avatarsOf(user.id)).toEqual([]);
    expect(fs.existsSync(avatar.filePath)).toBe(false);
    expect((await user.agent.get(`/api/assets/avatars/${user.id}`)).status).toBe(404);
  });
});

describe('deleting the avatar picture from the asset library', () => {
  it('clears the profile avatar, and brings no earlier one back', async () => {
    const user = await signedIn();
    const avatar = await setAvatar(user);

    expect((await user.agent.delete(`/api/assets/${avatar.id}`)).status).toBe(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { avatarUrl: true } });
    expect(row.avatarUrl).toBeNull();
    expect((await user.agent.get(`/api/assets/avatars/${user.id}`)).status).toBe(404);
  });
});
