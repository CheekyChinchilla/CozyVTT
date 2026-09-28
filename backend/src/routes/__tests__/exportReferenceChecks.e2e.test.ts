/**
 * An asset reachable only through an export is still an asset the caller
 * must be able to read.
 *
 * The reference check read a stored address with one parser, and the two
 * exports read it with others: the campaign archive took any directory and
 * the last id in the address, and the UVTT export took the address's last
 * segment, and neither checked who may read what it found. An address the
 * check did not recognise as naming an asset (a document's, one with a
 * second address stuck on the end, one with an extra segment) was stored as
 * naming nothing, and exporting the campaign then handed over another user's
 * private file. The check now refuses a same-origin address that is not an
 * asset's exact address, and each export includes only what its caller may
 * read.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-export-refs-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import unzipper from 'unzipper';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

let attackerId: string;
let victimId: string;
let campaignId: string;
let mapId: string;
let attacker: ReturnType<typeof request.agent>;
let privateId: string;
let ownId: string;
const assetIds: string[] = [];

async function makeAsset(uploadedById: string, label: string, type: 'TOKEN' | 'DOCUMENT') {
  const filename = `${label}-${randomUUID()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, PNG);
  const asset = await prisma.asset.create({
    data: { type, scope: 'USER', uploadedById, filename, originalName: `${label}.png`, mimeType: 'image/png', fileSize: PNG.length, filePath, name: label },
  });
  assetIds.push(asset.id);
  return asset.id;
}

beforeAll(async () => {
  const attackerUser = await createTestUser({ displayName: 'Export Attacker' });
  const victimUser = await createTestUser({ displayName: 'Export Victim' });
  attackerId = attackerUser.id;
  victimId = victimUser.id;
  campaignId = (await createTestCampaign(attackerId, { name: 'Attacker campaign' })).id;
  await prisma.campaignMembership.create({ data: { userId: attackerId, campaignId, role: 'DM', characterIds: [] } });
  privateId = await makeAsset(victimId, 'victim-private', 'DOCUMENT');
  ownId = await makeAsset(attackerId, 'attacker-own', 'TOKEN');
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Own', imageUrl: `/api/assets/maps/${ownId}`, baseLayerUrl: `/api/assets/maps/${ownId}`, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;
  attacker = request.agent(app);
  expect((await attacker.post('/api/auth/login').send({ email: attackerUser.email, password: TEST_PASSWORD })).status).toBe(200);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.tokenTemplate.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([attackerId, victimId]);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const at = (p: string) => `/api/campaigns/${campaignId}${p}`;

describe('an address that is not an asset\'s exact address', () => {
  it.each([
    ['a document\'s address', () => `/api/assets/documents/${privateId}`],
    ['a second address on the end', () => `/api/assets/tokens/${ownId}/api/assets/tokens/${privateId}`],
    ['an extra segment', () => `/api/assets/maps/x/${privateId}`],
    ['another API route', () => `/api/campaigns/${campaignId}/export`],
  ])('is refused as a template picture: %s', async (_label, address) => {
    const res = await attacker.post(at('/token-templates')).send({ name: 'x', imageUrl: address() });
    expect(res.status).toBe(403);
  });

  it('is refused as a map picture', async () => {
    const res = await attacker.put(at(`/maps/${mapId}`)).send({ imageUrl: `/api/assets/maps/x/${privateId}` });
    expect(res.status).toBe(403);
  });
});

describe('an export', () => {
  it('leaves out an asset its caller cannot read, whatever address names it', async () => {
    // As an older release, or a direct write, may have left it.
    await prisma.tokenTemplate.create({
      data: { campaignId, createdById: attackerId, name: 'Old', imageUrl: `/api/assets/documents/${privateId}`, type: 'npc', displayMode: 'pog', size: { width: 1, height: 1 } },
    });
    const res = await attacker.get(at('/export')).buffer(true).parse((r, done) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const entries = (await unzipper.Open.buffer(res.body as Buffer)).files.map((f) => f.path);
    expect(entries.some((e) => e.includes(ownId))).toBe(true);
    expect(entries.some((e) => e.includes(privateId))).toBe(false);
  });

  it('as a UVTT file, does not embed a map picture its caller cannot read', async () => {
    const stolen = await prisma.map.create({
      data: { campaignId, name: 'Stolen', imageUrl: `/api/assets/maps/x/${privateId}`, baseLayerUrl: `/api/assets/maps/x/${privateId}`, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
    });
    const res = await attacker.get(at(`/maps/${stolen.id}/export-uvtt`));
    expect(res.status).not.toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(PNG.toString('base64').slice(0, 40));
  });
});
