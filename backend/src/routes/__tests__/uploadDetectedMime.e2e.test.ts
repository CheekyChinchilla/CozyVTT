/**
 * An uploaded asset is recorded under the format its bytes show.
 *
 * The upload route checked a file's bytes against the allowlist of its type
 * and then stored the format the browser declared for it, which can be
 * anything. A real picture declared as plain text was accepted and recorded
 * as `text/plain`: it got no thumbnail, the Asset Library showed it as text,
 * and a campaign export wrote that into its archive.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-mime-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The real file-type is ESM-only; this knows a PNG, and nothing else, as the
// real one does not know an MP3 without a tag or a text file.
jest.mock('file-type', () => {
  const sniff = (head: Buffer) =>
    head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? { ext: 'png', mime: 'image/png' } : undefined;
  return {
    fileTypeFromBuffer: async (buf: Buffer) => sniff(buf),
    fileTypeFromFile: async (file: string) => {
      const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
      return sniff(readFileSync(file).subarray(0, 16));
    },
  };
});

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const MP3_FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(256)]);
const MARKDOWN = Buffer.from('# Handout\n\nThe door is behind the tapestry.\n');

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Upload Mime' });
  userId = user.id;
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

async function upload(type: string, bytes: Buffer, filename: string, contentType: string) {
  const res = await agent
    .post('/api/assets/upload')
    .field('type', type)
    .field('scope', 'USER')
    .attach('file', bytes, { filename, contentType });
  expect(res.status).toBe(201);
  return prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
}

describe('an uploaded asset', () => {
  it('is recorded as the picture it is, whatever the browser called it, and gets a thumbnail', async () => {
    const asset = await upload('TOKEN', PNG, 'goblin.png', 'text/plain');
    expect(asset.mimeType).toBe('image/png');
    expect(asset.thumbnailPath).not.toBeNull();
  });

  it('is recorded as the picture it is when the browser named it a web page', async () => {
    const asset = await upload('MAP', PNG, 'cave.png', 'text/html');
    expect(asset.mimeType).toBe('image/png');
  });

  it('is recorded as an MP3 when its header shows one the detector does not know', async () => {
    const asset = await upload('AUDIO', MP3_FRAME, 'rain.mp3', 'application/octet-stream');
    expect(asset.mimeType).toBe('audio/mpeg');
  });

  it('is recorded as Markdown or plain text by its name when its bytes are text', async () => {
    expect((await upload('DOCUMENT', MARKDOWN, 'handout.md', 'application/octet-stream')).mimeType).toBe('text/markdown');
    expect((await upload('DOCUMENT', MARKDOWN, 'handout.txt', 'image/png')).mimeType).toBe('text/plain');
  });
});
