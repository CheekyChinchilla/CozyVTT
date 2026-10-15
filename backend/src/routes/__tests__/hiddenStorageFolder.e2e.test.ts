/**
 * Files are served when the uploads or backups folder sits inside a folder
 * whose name starts with a dot.
 *
 * A self-hoster outside Docker may well keep CozyVTT under a hidden folder,
 * such as `~/.local/share/cozyvtt`. The library Express sends files with
 * refuses any path with a hidden folder in it unless told otherwise, so
 * every map, token, document, download and backup answered 404 there. The
 * paths are built by the server from stored rows and checked names, never
 * from the request, so the routes allow them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const HIDDEN = fs.mkdtempSync(path.join(os.tmpdir(), '.cozyvtt-hidden-'));
const UPLOAD_DIR = path.join(HIDDEN, 'uploads');
const BACKUP_DIR = path.join(HIDDEN, 'backups');
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.BACKUP_DIR = BACKUP_DIR;

import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let adminId: string;
let admin: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ role: PlatformRole.ADMIN, displayName: 'Hidden folder admin' });
  adminId = user.id;
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  try {
    await prisma.asset.deleteMany({ where: { uploadedById: adminId } });
    await cleanupUsers([adminId]);
  } finally {
    await prisma.$disconnect();
    fs.rmSync(HIDDEN, { recursive: true, force: true });
  }
});

/** A stored asset and its file under the uploads folder. */
async function plant(type: 'MAP' | 'DOCUMENT', filename: string, bytes: Buffer, mimeType: string, originalName = filename) {
  const dir = path.join(UPLOAD_DIR, type === 'MAP' ? 'maps' : 'documents', 'global');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, bytes);
  const asset = await prisma.asset.create({
    data: {
      type, scope: 'USER', uploadedById: adminId, campaignId: null,
      filename, originalName, mimeType,
      fileSize: bytes.length, filePath, name: originalName, tags: [],
    },
  });
  return asset.id;
}

it('serves a map image', async () => {
  const id = await plant('MAP', 'hidden-map.png', PNG, 'image/png');

  const res = await admin.get(`/api/assets/maps/${id}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/^image\/png/);
});

it('serves a Markdown document', async () => {
  const id = await plant('DOCUMENT', 'hidden-notes.md', Buffer.from('# Notes\n'), 'text/markdown');

  const res = await admin.get(`/api/assets/documents/${id}`);

  expect(res.status).toBe(200);
  expect(res.text).toBe('# Notes\n');
});

it('downloads an asset under its original name', async () => {
  const id = await plant('MAP', 'hidden-download.png', PNG, 'image/png', 'Cellar.png');

  const res = await admin.get(`/api/assets/${id}/download`);

  expect(res.status).toBe(200);
  expect(res.headers['content-disposition']).toMatch(/^attachment; filename="?Cellar\.png"?$/);
});

it('downloads a backup', async () => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = 'backup-2026-10-15T12-00-00.zip';
  fs.writeFileSync(path.join(BACKUP_DIR, filename), Buffer.from('PK\u0005\u0006'.padEnd(22, '\u0000')));

  const res = await admin.get(`/api/admin/backups/${filename}/download`);

  expect(res.status).toBe(200);
  expect(res.headers['content-disposition']).toMatch(new RegExp(`^attachment; filename="?${filename.replace(/\./g, '\\.')}"?$`));
});
