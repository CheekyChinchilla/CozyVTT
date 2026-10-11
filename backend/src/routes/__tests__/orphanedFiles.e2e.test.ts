/**
 * Files nobody can reach any more, for an admin to find and clear.
 *
 * A file can be left in the uploads folder with no asset row naming it: an
 * asset delete whose file could not be removed, a restore that brought back
 * files the restored database does not know, an upload interrupted at the
 * wrong moment. Nothing listed them. The report lists them and changes
 * nothing; deleting them is a separate request naming each file, and only
 * files that still have no row at that moment are removed.
 *
 * Separately, an asset whose uploader's account was deleted and which no
 * campaign holds is readable by admins alone. The admin asset list can now
 * be filtered to those.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PlatformRole } from '@prisma/client';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-orphans-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import * as fileUtils from '../../utils/fileUtils';

const app = createTestApp();
const userIds: string[] = [];
const assetIds: string[] = [];
const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);

async function signedIn(label: string, role?: PlatformRole) {
  const user = await createTestUser({ displayName: label, ...(role && { role }) });
  userIds.push(user.id);
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { user, agent };
}

/** Write a file under the uploads folder, dated `modified`, and return its path relative to the folder. */
function plant(relative: string, modified = TWO_HOURS_AGO, bytes = 'leftover'): string {
  const full = path.join(UPLOAD_DIR, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
  fs.utimesSync(full, modified, modified);
  return relative;
}

const exists = (relative: string) => fs.existsSync(path.join(UPLOAD_DIR, relative));

async function assetNaming(relative: string, thumbnail: string | null, uploadedById: string | null) {
  const asset = await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'USER', uploadedById,
      filename: path.basename(relative), originalName: 'map.png', mimeType: 'image/png', fileSize: 8,
      filePath: path.join(UPLOAD_DIR, relative).replace(/\\/g, '/'),
      thumbnailPath: thumbnail === null ? null : path.join(UPLOAD_DIR, thumbnail).replace(/\\/g, '/'),
      name: 'Planted map',
    },
  });
  assetIds.push(asset.id);
  return asset;
}

let admin: Awaited<ReturnType<typeof signedIn>>;
let player: Awaited<ReturnType<typeof signedIn>>;
const stranger = request(app);

const id = randomUUID();
const named = `maps/global/${id}.png`;
const namedThumb = `maps/global/thumb_${id}.png`;
let orphan: string;
let fresh: string;

beforeAll(async () => {
  admin = await signedIn('Orphan Admin', PlatformRole.ADMIN);
  player = await signedIn('Orphan Player');
  plant(named);
  plant(namedThumb);
  await assetNaming(named, namedThumb, admin.user.id);
  orphan = plant(`documents/global/${randomUUID()}.md`, TWO_HOURS_AGO, 'a deleted handout');
  fresh = plant(`tokens/campaigns/${randomUUID()}/${randomUUID()}.png`, new Date());
  // Not asset folders: work in progress, an older install's backups, and
  // anything else a self-hoster keeps there.
  plant(`temp/${randomUUID()}.png`);
  plant('backups/backup-2024-01-01T00-00-00.zip');
  plant('README.txt');
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupUsers(userIds);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('the leftover files report', () => {
  it('lists a file no asset names, and nothing else, and deletes nothing', async () => {
    const res = await admin.agent.get('/api/admin/orphaned-files');
    expect(res.status).toBe(200);
    expect(res.body.files).toEqual([
      { path: orphan, size: Buffer.byteLength('a deleted handout'), modifiedAt: TWO_HOURS_AGO.toISOString().replace(/\.\d{3}Z$/, '.000Z') },
    ]);
    expect(res.body.total).toBe(1);
    expect(res.body.totalBytes).toBe(Buffer.byteLength('a deleted handout'));
    // A file changed in the last hour may belong to an upload still finishing.
    expect(res.body.recent).toBe(1);
    expect(res.body.minimumAgeMinutes).toBe(60);

    for (const file of [orphan, fresh, named, namedThumb]) expect(exists(file)).toBe(true);
  });

  it('is refused to a player and to someone not signed in', async () => {
    expect((await player.agent.get('/api/admin/orphaned-files')).status).toBe(403);
    expect((await stranger.get('/api/admin/orphaned-files')).status).toBe(401);
  });
});

describe('deleting leftover files', () => {
  it('is refused to a player and to someone not signed in, and removes nothing', async () => {
    expect((await player.agent.delete('/api/admin/orphaned-files').send({ paths: [orphan] })).status).toBe(403);
    expect((await stranger.delete('/api/admin/orphaned-files').send({ paths: [orphan] })).status).toBe(401);
    expect(exists(orphan)).toBe(true);
  });

  it('refuses a request that does not name the files', async () => {
    const res = await admin.agent.delete('/api/admin/orphaned-files').send({ paths: 'everything' });
    expect(res.status).toBe(400);
    expect((await admin.agent.delete('/api/admin/orphaned-files').send({ paths: [] })).status).toBe(400);
    expect(exists(orphan)).toBe(true);
  });

  it('removes only the named files that still have no asset, and says which', async () => {
    const lateOrphan = plant(`audio/global/${randomUUID()}.mp3`);
    // Named by a row by the time the delete arrives.
    const adopted = plant(`maps/global/${randomUUID()}.png`);
    await assetNaming(adopted, null, admin.user.id);

    const res = await admin.agent.delete('/api/admin/orphaned-files').send({
      paths: [orphan, adopted, named, fresh, 'README.txt', '../outside.txt', `documents/global/${randomUUID()}.md`],
    });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toEqual([orphan]);
    expect(res.body.skipped).toHaveLength(6);
    expect(res.body.failed).toEqual([]);

    expect(exists(orphan)).toBe(false);
    for (const file of [adopted, named, namedThumb, fresh, lateOrphan, 'README.txt']) expect(exists(file)).toBe(true);
  });
});

describe('a file an asset delete could not remove', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is listed by the report once the asset is gone, and can then be deleted', async () => {
    const relative = plant(`tokens/global/${randomUUID()}.png`);
    const asset = await assetNaming(relative, null, admin.user.id);
    // The delete removes the row first and the file after; here the file
    // cannot be removed, which left it on disk with nothing naming it.
    jest.spyOn(fileUtils, 'deleteFile').mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    expect((await admin.agent.delete(`/api/assets/${asset.id}`)).status).toBe(200);
    expect(await prisma.asset.findUnique({ where: { id: asset.id } })).toBeNull();
    expect(exists(relative)).toBe(true);

    const report = await admin.agent.get('/api/admin/orphaned-files');
    expect((report.body.files as { path: string }[]).map((f) => f.path)).toContain(relative);

    const res = await admin.agent.delete('/api/admin/orphaned-files').send({ paths: [relative] });
    expect(res.body.deleted).toEqual([relative]);
    expect(exists(relative)).toBe(false);
  });
});

describe("the admin asset list's ownerless filter", () => {
  it('lists assets with no uploader, for an admin only', async () => {
    const ownerless = await assetNaming(`maps/global/${randomUUID()}.png`, null, null);
    const owned = await assetNaming(`maps/global/${randomUUID()}.png`, null, player.user.id);

    const res = await admin.agent.get('/api/assets').query({ uploadedBy: 'none', scope: 'USER', limit: 100, search: 'Planted map' });
    expect(res.status).toBe(200);
    const ids = (res.body.assets as { id: string; uploadedById: string | null }[]).map((a) => a.id);
    expect(ids).toContain(ownerless.id);
    expect(ids).not.toContain(owned.id);
    expect((res.body.assets as { uploadedById: string | null }[]).every((a) => a.uploadedById === null)).toBe(true);

    // A player's list is their own, whatever the query says.
    const theirs = await player.agent.get('/api/assets').query({ uploadedBy: 'none', limit: 100 });
    expect(theirs.status).toBe(200);
    expect((theirs.body.assets as { id: string }[]).map((a) => a.id)).not.toContain(ownerless.id);
  });
});
