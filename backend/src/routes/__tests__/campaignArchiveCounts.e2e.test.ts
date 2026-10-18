/**
 * A campaign that exports can be imported again, whatever it holds.
 *
 * The import refused a whole archive with more than 50 maps, 200 creatures,
 * 500 token templates or 500 pictures and sound files, while nothing limited
 * how many a campaign could hold, and the export did not check those counts:
 * a large campaign exported a file it could never import. The counts are now
 * limited only by what bounds an archive anyway (1,000 files in it, 10 MB for
 * each data file, the size limit), and the export refuses, saying why, a
 * campaign over those.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-counts-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { IMPORT_LIMITS } from '../../validators/campaignImport';

jest.setTimeout(120_000);

const app = createTestApp();
let dmId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Archive Counts' });
  dmId = user.id;
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await prisma.campaign.deleteMany({ where: { ownerId: dmId } });
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

/** A campaign of `maps` maps and `creatures` creatures, run by the DM. */
async function campaignOf(name: string, maps: number, creatures: number) {
  const campaignId = (await createTestCampaign(dmId, { name })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  await prisma.map.createMany({
    data: Array.from({ length: maps }, (_, i) => ({
      campaignId, name: `Room ${i}`, imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [],
    })),
  });
  await prisma.creatureTemplate.createMany({
    data: Array.from({ length: creatures }, (_, i) => ({
      campaignId, createdById: dmId, name: `Rat ${i}`, source: 'custom',
      statBlock: { ac: 12, speed: '30 ft.', abilities: { str: 2, dex: 11, con: 9, int: 2, wis: 10, cha: 4 } },
    })),
  });
  return campaignId;
}

const exportOf = (campaignId: string) =>
  dm.get(`/api/campaigns/${campaignId}/export`).buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

it('imports again a campaign of 60 maps and 250 creatures', async () => {
  const campaignId = await campaignOf('Sprawling', 60, 250);
  const exported = await exportOf(campaignId);
  expect(exported.status).toBe(200);
  const file = path.join(SCRATCH, 'sprawling.cozyvtt');
  fs.writeFileSync(file, exported.body as Buffer);

  const imported = await dm.post('/api/campaigns/import').attach('file', file);
  expect(imported.status).toBe(201);
  expect(imported.body).toMatchObject({ mapCount: 60, creatureCount: 250 });
});

it('refuses to export a campaign whose archive would hold more files than an import takes, saying why', async () => {
  const campaignId = await campaignOf('Too many rooms', IMPORT_LIMITS.MAX_FILE_COUNT, 0);
  const res = await exportOf(campaignId);
  expect(res.status).toBe(422);
  expect(JSON.parse((res.body as Buffer).toString()).message).toMatch(/files/);
});
