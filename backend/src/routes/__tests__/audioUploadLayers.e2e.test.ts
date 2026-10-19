/**
 * Only MPEG audio a browser can play is taken.
 *
 * MPEG layer 1 and 2 audio passes the content check as audio/mpeg, like an
 * MP3, and was stored under the extension the check names it by, .mp1 or
 * .mp2. The audio route serves only .mp3, .ogg and .wav, so the upload
 * succeeded and the track never played; browsers do not play those layers
 * either. They are refused at upload now.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-audio-layers-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Audio Layers' });
  userId = user.id;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

/** Three MPEG-1 frames of the given layer (second header byte), at 128 kbit/s and 44.1 kHz. */
function mpegFrames(secondByte: number): Buffer {
  const frame = () => {
    const f = Buffer.alloc(418);
    f[0] = 0xff;
    f[1] = secondByte;
    f[2] = 0x90;
    f[3] = 0x04;
    return f;
  };
  return Buffer.concat([frame(), frame(), frame()]);
}

const upload = (bytes: Buffer, filename: string) =>
  agent.post('/api/assets/upload').field('type', 'AUDIO').field('scope', 'USER').attach('file', bytes, { filename, contentType: 'audio/mpeg' });

it.each([['layer 1', 0xff], ['layer 2', 0xfd]])('refuses MPEG %s audio, which nothing would play', async (_label, secondByte) => {
  const res = await upload(mpegFrames(secondByte), 'fanfare.mp3');
  expect(res.status).toBe(400);
  expect(res.body.message).toBe('Invalid file type. AUDIO files must be one of: .mp3, .ogg, .wav');
  expect(await prisma.asset.count({ where: { uploadedById: userId } })).toBe(0);
});

it('takes an MP3, and serves it', async () => {
  const res = await upload(mpegFrames(0xfb), 'fanfare.mp3');
  expect(res.status).toBe(201);
  const served = await agent.get(`/api/assets/audio/${res.body.asset.id}`);
  expect(served.status).toBe(200);
  expect(served.headers['content-type']).toMatch(/^audio\/mpeg/);
});
