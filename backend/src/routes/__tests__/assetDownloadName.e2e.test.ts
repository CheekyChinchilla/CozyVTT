/**
 * The name an asset downloads under — End-to-End Tests
 *
 * Before 1.5.4 multer read an upload's file name as latin1, so a name with
 * accented letters was stored as its UTF-8 bytes read one at a time:
 * "café.png" as "cafÃ©.png". Express 4 sent that stored name as those same
 * bytes, which browsers read as UTF-8, so the file downloaded as "café.png".
 * Express 5 writes the name out properly, which shows the garbling, so the
 * download route reads such a name back as UTF-8. Names uploaded since are
 * stored in their real letters (uploadNameCharset.e2e.test.ts).
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

// A throwaway uploads directory, set before anything reads UPLOAD_DIR.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-download-name-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

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

describe('the name an asset downloads under', () => {
  let userId: string;
  let agent: ReturnType<typeof request.agent>;
  const uploadedIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser({ displayName: 'Download Name Tester' });
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

  /** Uploads a map as a browser does: the multipart file name in UTF-8. */
  async function upload(filename: string): Promise<string> {
    const res = await agent
      .post('/api/assets/upload')
      .field('type', 'MAP')
      .field('scope', 'USER')
      .attach('file', PNG, { filename, contentType: 'image/png' });
    expect(res.status).toBe(201);
    uploadedIds.push(res.body.asset.id);
    return res.body.asset.id;
  }

  it('keeps the accented letters of an uploaded name', async () => {
    const id = await upload('café.png');

    const res = await agent.get(`/api/assets/${id}/download`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="caf?.png"; filename*=UTF-8''caf%C3%A9.png`);
  });

  it('keeps letters outside Latin-1 too', async () => {
    const id = await upload('Höhle des Drachen 竜.png');

    const res = await agent.get(`/api/assets/${id}/download`);

    expect(res.headers['content-disposition']).toContain(
      `filename*=UTF-8''H%C3%B6hle%20des%20Drachen%20%E7%AB%9C.png`
    );
  });

  it('sends a plain name as it is', async () => {
    const id = await upload('cellar.png');

    const res = await agent.get(`/api/assets/${id}/download`);

    expect(res.headers['content-disposition']).toBe('attachment; filename=cellar.png');
  });

  it('reads back a name stored garbled before 1.5.4', async () => {
    const id = await upload('plain.png');
    await prisma.asset.update({ where: { id }, data: { originalName: Buffer.from('café.png', 'utf8').toString('latin1') } });

    const res = await agent.get(`/api/assets/${id}/download`);

    expect(res.headers['content-disposition']).toBe(`attachment; filename="caf?.png"; filename*=UTF-8''caf%C3%A9.png`);
  });

  it('does not read a name stored in its real letters a second time', async () => {
    const id = await upload('plain.png');
    await prisma.asset.update({ where: { id }, data: { originalName: 'café.png' } });

    const res = await agent.get(`/api/assets/${id}/download`);

    expect(res.headers['content-disposition']).toBe(`attachment; filename="caf?.png"; filename*=UTF-8''caf%C3%A9.png`);
  });
});
