/**
 * How a drawn map's picture is cached.
 *
 * A picture is served under its asset's id, and an uploaded one never
 * changes there, so a browser may keep it for a year. A picture Paint made
 * (tagged cozyvtt-drawn-map) is written over in place by each save, so a
 * browser holding it a year would show a shared Document, or a map, the
 * painting from before. It is revalidated on every request instead, with an
 * ETag from its id, size and modified time, as an editable text document
 * is; its thumbnail too.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-drawn-caching-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { DRAWN_MAP_TAG } from '../../validators/assetLimits';

const app = createTestApp();

let dmId = '';
let campaignId = '';
let dm: ReturnType<typeof request.agent>;

const picture = (colour: string) => sharp({ create: { width: 40, height: 30, channels: 3, background: colour } }).png().toBuffer();

/** A campaign map picture with a thumbnail beside it, tagged as given. */
async function stored(tags: string[]) {
  const filename = `${randomUUID()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  const thumbnailPath = path.join(UPLOAD_DIR, `thumb_${filename}`);
  const bytes = await picture('#336699');
  fs.writeFileSync(filePath, bytes);
  fs.writeFileSync(thumbnailPath, bytes);
  return prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: dmId, filename, originalName: filename,
      mimeType: 'image/png', fileSize: bytes.length, filePath, thumbnailPath, name: 'Picture', tags,
    },
  });
}

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Drawn caching DM' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Drawn caching' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe.each([
  ['picture', (id: string) => `/api/assets/maps/${id}`, (a: { filePath: string }) => a.filePath],
  ['thumbnail', (id: string) => `/api/assets/maps/${id}/thumbnail`, (a: { thumbnailPath: string | null }) => a.thumbnailPath!],
])('a drawn map picture, its %s', (_what, address, fileOf) => {
  it('is revalidated on every request, with an ETag that changes when the file does', async () => {
    const asset = await stored([DRAWN_MAP_TAG]);
    const first = await dm.get(address(asset.id));
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-cache');
    const etag = first.headers.etag;
    expect(etag).toMatch(new RegExp(`^"${asset.id}(-thumbnail)?-\\d+-\\d+"$`));
    expect((await dm.get(address(asset.id)).set('If-None-Match', etag)).status).toBe(304);

    fs.writeFileSync(fileOf(asset), await picture('#993366'));
    fs.utimesSync(fileOf(asset), new Date(), new Date(Date.now() + 5000));
    const after = await dm.get(address(asset.id)).set('If-None-Match', etag);
    expect(after.status).toBe(200);
    expect(after.headers.etag).not.toBe(etag);
  });
});

describe('an uploaded map picture', () => {
  it('is still cached as unchanging, picture and thumbnail', async () => {
    const asset = await stored(['drawn-map']);
    for (const address of [`/api/assets/maps/${asset.id}`, `/api/assets/maps/${asset.id}/thumbnail`]) {
      const res = await dm.get(address);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    }
  });
});
