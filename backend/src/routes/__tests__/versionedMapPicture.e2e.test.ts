/**
 * A map's picture address with a version, `/api/assets/maps/<id>?v=<digits>`.
 *
 * A drawn map's picture is written over in place, and the map is given its
 * address with a new version on every save, so each viewer's browser asks
 * for the new picture. The address names the same asset as the one without
 * a version: Create Map and Edit Map store it, and the rules that read a
 * map's picture (who may see it, the Universal VTT export) read the asset
 * it names. Any other query after a picture address is still refused.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-versioned-map-picture-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { randomUUID } from 'crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

type Agent = ReturnType<typeof request.agent>;
const users = { dm: '', player: '' };
let campaignId = '';
let pictureId = '';
let dm: Agent;
let player: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  const stamp = Date.now();
  const made = await Promise.all((['dm', 'player'] as const).map((who) =>
    createTestUser({ email: `versioned-${who}-${stamp}@test.cozyvtt.local`, displayName: `Versioned ${who}` })));
  [users.dm, users.player] = made.map((u) => u.id);
  campaignId = (await createTestCampaign(users.dm, { name: `Versioned ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: users.dm, campaignId, role: 'DM', characterIds: [] },
      { userId: users.player, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } }).png().toBuffer();
  const filename = `${randomUUID()}.png`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, png);
  pictureId = (await prisma.asset.create({
    data: {
      type: 'MAP', scope: 'CAMPAIGN', campaignId, uploadedById: users.dm, filename, originalName: 'drawn-map.png',
      mimeType: 'image/png', fileSize: png.length, filePath, name: 'Drawn map', tags: ['cozyvtt-drawn-map'],
    },
  })).id;
  dm = await login(made[0].email);
  player = await login(made[1].email);
});

afterAll(async () => {
  await prisma.map.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { uploadedById: { in: Object.values(users) } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers(Object.values(users));
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

const at = (p: string) => `/api/campaigns/${campaignId}${p}`;
const versioned = (v: string) => `/api/assets/maps/${pictureId}?v=${v}`;

async function storedMap(name: string, imageUrl: string) {
  return prisma.map.create({
    data: { campaignId, name, imageUrl, baseLayerUrl: imageUrl, width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  });
}

describe('Create Map and Edit Map', () => {
  it('store a map picture address with a version as it is given', async () => {
    const created = await dm.post(at('/maps')).send({ name: 'Drawn', width: 10, height: 10, gridSize: 50, imageUrl: versioned('1730000000000') });
    expect(created.status).toBe(201);
    expect(created.body.map.imageUrl).toBe(versioned('1730000000000'));

    const edited = await dm.put(at(`/maps/${created.body.map.id}`)).send({ imageUrl: versioned('1730000000001') });
    expect(edited.status).toBe(200);
    const stored = await prisma.map.findUniqueOrThrow({ where: { id: created.body.map.id } });
    expect([stored.imageUrl, stored.baseLayerUrl]).toEqual([versioned('1730000000001'), versioned('1730000000001')]);
  });

  it.each(['', '1a', '1&x=2'])('refuse ?v=%s, and any other query', async (v) => {
    const map = await storedMap('Refusing', `/api/assets/maps/${pictureId}`);
    for (const address of [versioned(v), `/api/assets/maps/${pictureId}?w=1`, `/api/assets/maps/${pictureId}#v=1`]) {
      const res = await dm.put(at(`/maps/${map.id}`)).send({ imageUrl: address });
      expect([address, res.status]).toEqual([address, 403]);
    }
    expect((await prisma.map.findUniqueOrThrow({ where: { id: map.id } })).imageUrl).toBe(`/api/assets/maps/${pictureId}`);
  });
});

describe('a player at the table', () => {
  it('reads the picture of the map the table is on by its versioned address', async () => {
    const map = await storedMap('At the table', versioned('1730000000002'));
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: map.id } });
    expect((await player.get(`/api/assets/maps/${pictureId}?v=1730000000002`)).status).toBe(200);
    expect((await player.get(`/api/assets/${pictureId}`)).status).toBe(200);
    const listed = await player.get('/api/assets').query({ campaignId, type: 'MAP' });
    expect(listed.body.assets.map((a: { id: string }) => a.id)).toContain(pictureId);
  });

  it('is refused it once the table is on another map', async () => {
    const other = await storedMap('Elsewhere', '');
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: other.id } });
    expect((await player.get(`/api/assets/maps/${pictureId}`)).status).toBe(404);
  });
});

describe('a Universal VTT export', () => {
  it('reads the picture a versioned address names', async () => {
    const map = await storedMap('Exported', versioned('1730000000003'));
    const res = await dm.get(at(`/maps/${map.id}/export-uvtt`));
    expect(res.status).toBe(200);
  });
});
