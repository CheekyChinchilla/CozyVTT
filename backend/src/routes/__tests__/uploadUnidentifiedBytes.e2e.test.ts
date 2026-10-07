/**
 * What happens when file-type cannot identify an upload.
 *
 * The validator had an exception for that case: a file named .mp3 uploaded
 * as AUDIO was accepted without further checks. The reasoning was that
 * file-type might miss the format. It does not: a real MP3 is identified by
 * its bytes and passes the ordinary MIME check. So the exception only ever
 * fired for bytes nothing could identify, and accepted them on the strength of
 * a filename.
 *
 * The fix checks the leading bytes itself in that branch: a real MP3 starts
 * with an ID3 tag or an MPEG frame sync. Anything else named .mp3 is refused.
 * A MAP named .pdf is refused outright, since a PDF cannot be drawn as a map.
 *
 * file-type is stubbed to report nothing, which is the branch under test.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-unidentified-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

jest.mock('file-type', () => ({
  fileTypeFromFile: jest.fn(async () => undefined),
  fileTypeFromBuffer: jest.fn(async () => undefined),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const REAL_PDF_HEADER = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(64, 0x20)]);
const REAL_MP3_ID3 = Buffer.concat([Buffer.from('494433030000000000', 'hex'), Buffer.alloc(256)]);
const REAL_MP3_FRAME = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(256)]);
const GARBAGE = Buffer.from([0x80, 0x81, 0x82, 0xfe, 0xfd, 0x00, 0x99, 0x13, 0x37]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('uploads file-type cannot identify', () => {
  let userId: string;
  let agent: ReturnType<typeof request.agent>;
  const uploadedIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Unidentified Uploader' });
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

  describe('a MAP named .pdf', () => {
    it('is refused even when the bytes really start a PDF, since a PDF cannot be drawn as a map', async () => {
      const res = await upload('MAP', 'floorplan.pdf', REAL_PDF_HEADER, 'application/pdf');
      expect(res.status).toBe(400);
    });

    it('is refused when the bytes are garbage', async () => {
      const res = await upload('MAP', 'floorplan.pdf', GARBAGE, 'application/pdf');
      expect(res.status).toBe(400);
    });

    it('is refused when the bytes are HTML', async () => {
      const res = await upload('MAP', 'floorplan.pdf', HTML, 'application/pdf');
      expect(res.status).toBe(400);
    });
  });

  describe('AUDIO named .mp3', () => {
    it('is accepted with an ID3 tag', async () => {
      const res = await upload('AUDIO', 'theme.mp3', REAL_MP3_ID3, 'audio/mpeg');
      expect(res.status).toBe(201);
    });

    it('is accepted with a bare MPEG frame', async () => {
      const res = await upload('AUDIO', 'theme.mp3', REAL_MP3_FRAME, 'audio/mpeg');
      expect(res.status).toBe(201);
    });

    it('is refused when the bytes are garbage', async () => {
      const res = await upload('AUDIO', 'theme.mp3', GARBAGE, 'audio/mpeg');
      expect(res.status).toBe(400);
    });

    it('is refused when the bytes are HTML', async () => {
      const res = await upload('AUDIO', 'theme.mp3', HTML, 'audio/mpeg');
      expect(res.status).toBe(400);
    });
  });

  it('leaves nothing in the temp directory after the refusals', () => {
    expect(uploadedIds).toHaveLength(2);
    const temp = path.join(UPLOAD_DIR, 'temp');
    expect(fs.existsSync(temp) ? fs.readdirSync(temp) : []).toEqual([]);
  });
});
