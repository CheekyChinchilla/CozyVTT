/**
 * Universal VTT imports from different people wait their turn, and none is
 * refused.
 *
 * A UVTT file can be over 50 MB, almost all of it the map picture, and the
 * import held the upload and its decoded picture in memory together. One
 * import at a time per user was the only bound, so three people importing at
 * once took the backend near its memory limit. The upload now waits on disk,
 * and the part that holds the picture in memory runs for one import at a
 * time across the server; the others queue behind it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-uvtt-queue-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
  fileTypeFromFile: jest.fn(async () => ({ ext: 'png', mime: 'image/png' })),
}));

/** How many imports are inside the picture-holding part at once, at most. */
const inside = { now: 0, most: 0 };
jest.mock('../../utils/thumbnails', () => ({
  generateThumbnail: jest.fn(async () => {
    inside.now += 1;
    inside.most = Math.max(inside.most, inside.now);
    await new Promise((resolve) => setTimeout(resolve, 150));
    inside.now -= 1;
    return null;
  }),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';

const app = createTestApp();

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const UVTT = Buffer.from(
  JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 10, y: 10 }, pixels_per_grid: 140 },
    line_of_sight: [[{ x: 1, y: 1 }, { x: 2, y: 1 }]],
    portals: [],
    lights: [],
    image: PNG.toString('base64'),
  })
);

const users: string[] = [];
const campaigns: string[] = [];

async function dmWithCampaign(): Promise<{ agent: request.Agent; campaignId: string }> {
  const user = await createTestUser({ displayName: 'UVTT queue DM' });
  users.push(user.id);
  const campaignId = (await createTestCampaign(user.id)).id;
  campaigns.push(campaignId);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role: 'DM', characterIds: [] } });
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD })).status).toBe(200);
  return { agent, campaignId };
}

const importUvtt = (dm: { agent: request.Agent; campaignId: string }, file = UVTT) =>
  dm.agent.post(`/api/campaigns/${dm.campaignId}/maps/import-uvtt`).field('name', 'Queued Map').attach('file', file, 'queued.uvtt');

/** Files left in the uploads folder's temporary area. */
function leftInTemp(): string[] {
  const temp = path.join(UPLOAD_DIR, 'temp');
  if (!fs.existsSync(temp)) return [];
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(temp);
  return found;
}

afterAll(async () => {
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('POST /api/campaigns/:campaignId/maps/import-uvtt from several DMs at once', () => {
  it('imports every file, one at a time', async () => {
    const dms = [await dmWithCampaign(), await dmWithCampaign(), await dmWithCampaign()];
    inside.most = 0;

    const results = await Promise.all(dms.map((dm) => importUvtt(dm)));

    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(inside.most).toBe(1);
  });

  it('leaves no upload behind in the temporary folder, whether the import works or not', async () => {
    const dm = await dmWithCampaign();
    expect((await importUvtt(dm)).status).toBe(201);
    expect((await importUvtt(dm, Buffer.from('not json at all'))).status).toBe(400);

    expect(leftInTemp()).toEqual([]);
  });
});
