/**
 * Map and token thumbnails are served.
 *
 * Every map and token upload makes a thumbnail of at most 512 pixels, and no
 * route served it, so the Asset Library and the pickers drew 200-pixel cards
 * from full-size originals. GET /api/assets/maps/:id/thumbnail and
 * /tokens/:id/thumbnail serve it, by the full picture's read rule. An asset
 * with no thumbnail (one imported, or uploaded before thumbnails) is sent
 * its full picture there.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-thumbnails-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const users: string[] = [];
let owner: ReturnType<typeof request.agent>;
let stranger: ReturnType<typeof request.agent>;

async function signedIn(displayName: string) {
  const user = await createTestUser({ displayName });
  users.push(user.id);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  return { id: user.id, agent };
}

beforeAll(async () => {
  owner = (await signedIn('Thumb Owner')).agent;
  stranger = (await signedIn('Thumb Stranger')).agent;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: users } } });
  await cleanupUsers(users);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const bigPng = () => sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#4a7a4a' } }).png().toBuffer();

async function uploaded(type: 'MAP' | 'TOKEN') {
  const res = await owner.post('/api/assets/upload').field('type', type).field('scope', 'USER')
    .attach('file', await bigPng(), { filename: 'big.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return res.body.asset.id as string;
}

/** A response body read as bytes. */
const bytes = (req: request.Test) => req.buffer(true).parse((res, done) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
});

describe.each([['MAP', 'maps', 'Map asset not found'], ['TOKEN', 'tokens', 'Token asset not found']] as const)(
  'a %s thumbnail',
  (type, dir, notFound) => {
    it('is the 512-pixel picture made at upload', async () => {
      const id = await uploaded(type);
      const res = await bytes(owner.get(`/api/assets/${dir}/${id}/thumbnail`));
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      const { width, height } = await sharp(res.body as Buffer).metadata();
      expect([width, height]).toEqual([512, 384]);
    });

    it('is the full picture for an asset with no thumbnail', async () => {
      const id = await uploaded(type);
      await prisma.asset.update({ where: { id }, data: { thumbnailPath: null } });
      const res = await bytes(owner.get(`/api/assets/${dir}/${id}/thumbnail`));
      expect(res.status).toBe(200);
      expect((await sharp(res.body as Buffer).metadata()).width).toBe(1600);
    });

    it('is answered to someone who may not read the picture as if it were not there', async () => {
      const id = await uploaded(type);
      const res = await stranger.get(`/api/assets/${dir}/${id}/thumbnail`);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(notFound);
    });
  },
);

it('is not served for an asset of the other kind', async () => {
  const id = await uploaded('TOKEN');
  expect((await owner.get(`/api/assets/maps/${id}/thumbnail`)).status).toBe(404);
});

it('answers a repeat request with 304', async () => {
  const id = await uploaded('MAP');
  const first = await owner.get(`/api/assets/maps/${id}/thumbnail`);
  const again = await owner.get(`/api/assets/maps/${id}/thumbnail`).set('If-None-Match', first.headers.etag);
  expect(again.status).toBe(304);
});
