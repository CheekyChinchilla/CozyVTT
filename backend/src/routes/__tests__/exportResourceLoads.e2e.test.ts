/**
 * The exports are downloads, not page resources.
 *
 * A campaign or map export is fetched by the app, or opened directly, by its
 * DM. Nothing stopped a page from loading one as a picture or a frame, which
 * the browser does with the viewer's cookies: each such load would make the
 * server build a whole archive. A request the browser marks as loading a page
 * resource (Sec-Fetch-Dest set and not `empty` or `document`) is now refused;
 * the app's fetch, a direct visit and a script (which sends no such header)
 * are not.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-export-loads-'));
process.env.UPLOAD_DIR = path.join(SCRATCH, 'uploads');

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();
let dmId: string;
let campaignId: string;
let mapId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Export Loads' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Export loads' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  mapId = (await prisma.map.create({
    data: { campaignId, name: 'Room', imageUrl: '', baseLayerUrl: '', width: 10, height: 10, gridSize: 50, annotations: [], tokens: [] },
  })).id;
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
  fs.rmSync(SCRATCH, { recursive: true, force: true });
});

const campaignExport = () => `/api/campaigns/${campaignId}/export`;
const mapExport = () => `/api/campaigns/${campaignId}/maps/${mapId}/export-uvtt`;

it.each([
  ['the campaign export', campaignExport],
  ['the map export', mapExport],
])('refuses %s loaded as a picture or a frame', async (_label, url) => {
  for (const dest of ['image', 'iframe', 'script']) {
    const res = await dm.get(url()).set('Sec-Fetch-Dest', dest);
    expect(res.status).toBe(403);
  }
});

it('serves the campaign export to the app\'s fetch, a direct visit and a script', async () => {
  for (const headers of [{ 'Sec-Fetch-Dest': 'empty' }, { 'Sec-Fetch-Dest': 'document' }, {}] as Array<Record<string, string>>) {
    const res = await dm.get(campaignExport()).set(headers).buffer(true).parse((r, done) => { r.on('data', () => {}); r.on('end', () => done(null, null)); });
    expect(res.status).toBe(200);
  }
});
