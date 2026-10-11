/**
 * Map and token images are served with a safe, explicit Content-Type.
 *
 * The generic upload path applies no extension filter and validates a file by
 * its bytes, never checking that the extension agrees with them. So a genuine
 * image could be stored under any name: a real PNG uploaded as `evil.html`, or
 * a GIF whose header `GIF89a` is also a valid JavaScript identifier uploaded as
 * `x.js`. The map and token routes then served the file with `res.sendFile` and
 * no explicit type, so Express set the Content-Type from that attacker-chosen
 * extension: `text/html`, or `application/javascript`. Both come back from the
 * instance's own origin, which is stored cross-site scripting once one file
 * loads another as a script.
 *
 * The fix is in two places, and this exercises both. The extension is
 * normalised at upload to match the validated content, so nothing but an image
 * extension is ever stored. And the serving routes send an explicit
 * Content-Type from a whitelist keyed on that extension, with
 * `X-Content-Type-Options: nosniff`, so a file already on disk under a bad name
 * is served as bytes to download and never as a page or a script.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-serve-ct-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  cleanupUsers,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
// A file that is both a valid GIF and valid JavaScript.
const GIF_JS = Buffer.concat([Buffer.from('GIF89a=1;alert(1);//'), Buffer.from([0x00])]);

let userId: string;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const u = await createTestUser({
    email: `serve-ct-${Date.now()}@test.cozyvtt.local`,
    displayName: 'Serve CT',
  });
  userId = u.id;
  agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: u.email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: userId } });
  await cleanupUsers([userId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

/** Plant a row and a file on disk under a name the row was never meant to have. */
async function plant(type: 'MAP' | 'TOKEN', filename: string, bytes: Buffer) {
  const dir = path.join(UPLOAD_DIR, type === 'MAP' ? 'maps' : 'tokens', 'global');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, bytes);
  const asset = await prisma.asset.create({
    data: {
      type, scope: 'USER', uploadedById: userId, campaignId: null,
      filename, originalName: filename, mimeType: 'image/png',
      fileSize: bytes.length, filePath, name: filename, tags: [],
    },
  });
  return asset.id;
}

describe('serving a file stored under a dangerous name', () => {
  it('does not serve a map as text/html', async () => {
    const id = await plant('MAP', 'evil.html', PNG);
    const res = await agent.get(`/api/assets/maps/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type'] || '').not.toMatch(/text\/html/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not serve a token as application/javascript', async () => {
    const id = await plant('TOKEN', 'evil.js', GIF_JS);
    const res = await agent.get(`/api/assets/tokens/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type'] || '').not.toMatch(/javascript/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves a genuine image with its image type', async () => {
    const id = await plant('MAP', 'real.png', PNG);
    const res = await agent.get(`/api/assets/maps/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('uploading an image under a dangerous name', () => {
  const upload = (name: string, mime: string, bytes: Buffer, type: string) =>
    agent
      .post('/api/assets/upload')
      .attach('file', bytes, { filename: name, contentType: mime })
      .field('type', type)
      .field('scope', 'USER')
      .field('name', name);

  it('normalises a PNG uploaded as .html to a png on disk', async () => {
    const res = await upload('evil.html', 'image/png', PNG, 'MAP');
    expect(res.status).toBe(201);
    expect(res.body.asset.filename).toMatch(/\.png$/);
    // And it is then served as an image, not a page.
    const served = await agent.get(`/api/assets/maps/${res.body.asset.id}`);
    expect(served.headers['content-type']).toMatch(/image\/png/);
  });

  it('normalises a GIF uploaded as .js to a gif on disk', async () => {
    const res = await upload('evil.js', 'image/gif', GIF_JS, 'TOKEN');
    expect(res.status).toBe(201);
    expect(res.body.asset.filename).toMatch(/\.gif$/);
    const served = await agent.get(`/api/assets/tokens/${res.body.asset.id}`);
    expect(served.headers['content-type'] || '').not.toMatch(/javascript/);
  });
});
