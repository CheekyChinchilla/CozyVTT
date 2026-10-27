/**
 * A campaign that exports can be imported again, whatever it holds.
 *
 * The import refused a whole archive with more than 50 maps, 200 creatures,
 * 500 token templates or 500 pictures and sound files, while nothing limited
 * how many a campaign could hold, and the export did not check those counts:
 * a large campaign exported a file it could never import. Maps and files are
 * now limited by what bounds an archive anyway (1,000 files in it, 10 MB for
 * each data file, the size limit); creatures and token templates to 2,000
 * each, since a 10 MB list of tens of thousands stopped the server. The
 * export refuses, saying why, a campaign over any of them.
 *
 * What an archive holds stops at the campaign's maps, creatures and token
 * templates: no chat message travels in one. A whisper is for its two people,
 * and an archive goes to whoever imports it, a DM who reads none of them.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-archive-counts-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import unzipper from 'unzipper';
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

it('carries no chat message, a whisper least of all', async () => {
  const campaignId = await campaignOf('Talkative', 1, 0);
  const player = await createTestUser({ displayName: 'Archive Whisperer' });
  await prisma.campaignMembership.create({ data: { userId: player.id, campaignId, role: 'PLAYER', characterIds: [] } });
  await prisma.message.createMany({
    data: [
      { campaignId, userId: dmId, type: 'PLAYER', content: 'said-to-everyone-7f3a' },
      { campaignId, userId: player.id, recipientId: dmId, type: 'WHISPER', content: 'said-in-a-whisper-9c1d' },
    ],
  });

  const exported = await exportOf(campaignId);

  expect(exported.status).toBe(200);
  const entries = (await unzipper.Open.buffer(exported.body as Buffer)).files;
  for (const entry of entries) {
    const text = (await entry.buffer()).toString('utf8');
    expect(text).not.toContain('said-to-everyone-7f3a');
    expect(text).not.toContain('said-in-a-whisper-9c1d');
  }
  expect(entries.map((e) => e.path).filter((name) => /message|chat|whisper/i.test(name))).toEqual([]);
  const manifest: unknown = JSON.parse((await entries.find((e) => e.path === 'manifest.json')!.buffer()).toString('utf8'));
  expect(Object.keys(manifest as object).filter((key) => /message|chat|whisper/i.test(key))).toEqual([]);
  await cleanupUsers([player.id]);
});

it('refuses to export a campaign whose archive would hold more files than an import takes, saying why', async () => {
  const campaignId = await campaignOf('Too many rooms', IMPORT_LIMITS.MAX_FILE_COUNT, 0);
  const res = await exportOf(campaignId);
  expect(res.status).toBe(422);
  expect(JSON.parse((res.body as Buffer).toString()).message).toMatch(/files/);
});

it('refuses to export a campaign with more custom creatures than an import takes, saying why', async () => {
  const campaignId = await campaignOf('Bestiary', 0, IMPORT_LIMITS.MAX_CREATURES + 1);
  const res = await exportOf(campaignId);
  expect(res.status).toBe(422);
  expect(JSON.parse((res.body as Buffer).toString()).message).toBe(
    'This campaign has 2,001 custom creatures, more than the 2,000 a campaign archive can carry. Delete some it no longer uses, then export again.'
  );
});

