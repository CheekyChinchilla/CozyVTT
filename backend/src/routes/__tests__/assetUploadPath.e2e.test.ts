/**
 * Where an uploaded asset is written — End-to-End Tests
 *
 * Every upload landed in `uploads/maps/global/`, whatever it was. A token image
 * went there; so did audio.
 *
 * The cause is an ordering one. `POST /api/assets/upload` deliberately runs a
 * generic multer pass first, because the asset type arrives as a *field* of the
 * same multipart body as the file and cannot be read until that body is parsed.
 * Multer's `destination` callback therefore runs before anything knows what is
 * being uploaded, and fell back to `req.assetType || 'MAP'`.
 *
 * Nothing broke: the database records the real path, so files serve and delete
 * correctly. But the directories say something untrue, which matters to a
 * self-hoster looking through their own uploads folder, and means the per-type
 * layout the code goes to the trouble of describing never actually happens.
 *
 * "global" in these paths means "not campaign-specific" rather than
 * "world-readable" — there is no per-user directory by design, so a USER-scoped
 * asset living under `global` is correct and is not what these check.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// A throwaway uploads directory, set before anything reads UPLOAD_DIR, so no
// test file is ever written into the repository's own uploads folder.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// The `file-type` stand-in throws by design; magic-byte sniffing is stubbed
// here, as its own comment instructs. What is under test is where the file
// lands, not whether the bytes are really a PNG.
jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn(async (filePath: string) =>
    filePath.endsWith('.mp3')
      ? { ext: 'mp3', mime: 'audio/mpeg' }
      : { ext: 'png', mime: 'image/png' }
  ),
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

/** A tiny valid MP3 frame header, enough to pass type sniffing. */
const MP3 = Buffer.concat([Buffer.from('494433030000000000', 'hex'), Buffer.alloc(256)]);

describe('asset upload paths', () => {
  let userId: string;
  let agent: ReturnType<typeof request.agent>;
  const uploadedIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Upload Path Tester' });
    userId = user.id;
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await prisma.asset.deleteMany({ where: { id: { in: uploadedIds } } });
    await cleanupUsers([userId]);
    await prisma.$disconnect();
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  });

  async function upload(type: string, filename: string, body: Buffer, contentType: string) {
    const res = await agent
      .post('/api/assets/upload')
      .field('type', type)
      .field('scope', 'USER')
      .attach('file', body, { filename, contentType });
    if (res.body?.asset?.id) uploadedIds.push(res.body.asset.id);
    return res;
  }

  it('writes a token image under tokens, not maps', async () => {
    const res = await upload('TOKEN', 'goblin.png', PNG, 'image/png');
    expect(res.status).toBe(201);

    const stored = res.body.asset.filePath.replace(/\\/g, '/');
    expect(stored).toContain('/tokens/');
    expect(stored).not.toContain('/maps/');
  });

  it('writes a map image under maps', async () => {
    const res = await upload('MAP', 'battlemap.png', PNG, 'image/png');
    expect(res.status).toBe(201);
    expect(res.body.asset.filePath.replace(/\\/g, '/')).toContain('/maps/');
  });

  it('writes audio under audio', async () => {
    const res = await upload('AUDIO', 'ambience.mp3', MP3, 'audio/mpeg');
    expect(res.status).toBe(201);
    expect(res.body.asset.filePath.replace(/\\/g, '/')).toContain('/audio/');
  });

  it('leaves the file readable at the path it recorded', async () => {
    const res = await upload('TOKEN', 'reachable.png', PNG, 'image/png');
    expect(res.status).toBe(201);
    // The whole point of the move: the database and the disk must still agree.
    expect(fs.existsSync(res.body.asset.filePath)).toBe(true);
  });

  it('records a size matching the file actually on disk', async () => {
    const res = await upload('TOKEN', 'sized.png', PNG, 'image/png');
    expect(res.status).toBe(201);
    expect(fs.statSync(res.body.asset.filePath).size).toBe(res.body.asset.fileSize);
  });
});
