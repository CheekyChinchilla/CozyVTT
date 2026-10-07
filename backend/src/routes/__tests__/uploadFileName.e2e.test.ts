/**
 * The name an uploaded file is recorded under — End-to-End Tests
 *
 * Browsers cannot write a double quote or a line break inside the quoted
 * filename of a multipart part, so they write `%22`, `%0D` and `%0A` instead.
 * The upload parser used to hand those back untouched, so a file called
 * `Dragon "Smaug".png` appeared in the library as `Dragon %22Smaug%22.png`.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-upload-name-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

// Magic-byte sniffing is stubbed, as in the other upload suites. What is under
// test is the recorded name, not whether the bytes really are a PNG.
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

describe('the name an uploaded file is recorded under', () => {
  let userId: string;
  let agent: ReturnType<typeof request.agent>;
  const uploadedIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Upload Name Tester' });
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

  /** Upload a PNG whose filename is written the way a browser writes it, quotes escaped. */
  async function uploadAs(escapedFilename: string) {
    const boundary = '----CozyNameBoundary';
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nTOKEN\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="scope"\r\n\r\nUSER\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${escapedFilename}"\r\n` +
        `Content-Type: image/png\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const res = await agent
      .post('/api/assets/upload')
      .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
      .send(Buffer.concat([head, PNG, tail]));
    if (res.body?.asset?.id) uploadedIds.push(res.body.asset.id);
    return res;
  }

  it('keeps a double quote written as %22', async () => {
    const res = await uploadAs('Dragon %22Smaug%22.png');
    expect(res.status).toBe(201);

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
    expect(asset.originalName).toBe('Dragon "Smaug".png');
    expect(asset.name).toBe('Dragon "Smaug".png');
  });

  it('leaves a percent sign that is not an escape alone', async () => {
    const res = await uploadAs('50%25 off.png');
    expect(res.status).toBe(201);

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: res.body.asset.id } });
    expect(asset.originalName).toBe('50%25 off.png');
  });
});
