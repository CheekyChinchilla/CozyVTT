/**
 * The tag that marks a picture drawn in CozyVTT.
 *
 * Paint takes a campaign map picture carrying the tag as one it made: the DM
 * is offered Paint on it, and a later Save deletes it. Any uploader could set
 * the tag, and it was a word a DM might type themselves, so an uploaded
 * picture could be taken for a drawn one and deleted by a save. The tag is
 * now one no upload of 1.5.4 carries, and only the upload Paint makes may
 * set it: a campaign map picture, which only the campaign's DM may upload.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-drawn-map-tag-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { DRAWN_MAP_TAG } from '../../validators/assetLimits';

const app = createTestApp();

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154' +
    '789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex'
);

type Agent = ReturnType<typeof request.agent>;
const users = { dm: '', player: '', manager: '' };
let campaignId = '';
let dm: Agent;
let player: Agent;
let manager: Agent;

async function login(email: string): Promise<Agent> {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

function upload(agent: Agent, fields: { type: string; scope: string; campaignId?: string; tags: string }) {
  let req = agent.post('/api/assets/upload').field('type', fields.type).field('scope', fields.scope).field('tags', fields.tags);
  if (fields.campaignId) req = req.field('campaignId', fields.campaignId);
  return req.attach('file', PNG, 'picture.png');
}

const REFUSAL = `The tag ${DRAWN_MAP_TAG} is kept for maps drawn in CozyVTT.`;

beforeAll(async () => {
  const stamp = Date.now();
  const made = await Promise.all((['dm', 'player', 'manager'] as const).map((who) =>
    createTestUser({ email: `drawn-tag-${who}-${stamp}@test.cozyvtt.local`, displayName: `Drawn tag ${who}` })));
  [users.dm, users.player, users.manager] = made.map((u) => u.id);
  await prisma.user.update({ where: { id: users.manager }, data: { globalAssetManager: true } });
  campaignId = (await createTestCampaign(users.dm, { name: `Drawn tag ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: users.dm, campaignId, role: 'DM', characterIds: [] },
      { userId: users.player, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  // One at a time: the server hashes one password per address at once.
  dm = await login(made[0].email);
  player = await login(made[1].email);
  manager = await login(made[2].email);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: Object.values(users) } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers(Object.values(users));
  await prisma.$disconnect();
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe(`the ${DRAWN_MAP_TAG} tag on an upload`, () => {
  it("is kept on a map picture the DM uploads into the campaign's library", async () => {
    const res = await upload(dm, { type: 'MAP', scope: 'CAMPAIGN', campaignId, tags: DRAWN_MAP_TAG });
    expect(res.status).toBe(201);
    expect(res.body.asset.tags).toEqual([DRAWN_MAP_TAG]);
  });

  it.each([
    ['a personal map picture', () => upload(dm, { type: 'MAP', scope: 'USER', tags: `dungeon,${DRAWN_MAP_TAG}` })],
    ['a campaign token picture', () => upload(player, { type: 'TOKEN', scope: 'CAMPAIGN', campaignId, tags: DRAWN_MAP_TAG })],
    ['a global map picture', () => upload(manager, { type: 'MAP', scope: 'GLOBAL', tags: DRAWN_MAP_TAG })],
    ['a personal one in another case', () => upload(player, { type: 'MAP', scope: 'USER', tags: DRAWN_MAP_TAG.toUpperCase() })],
  ])('is refused on %s, which stores nothing', async (_what, send) => {
    const before = await prisma.asset.count({ where: { uploadedById: { in: Object.values(users) } } });
    const res = await send();
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(REFUSAL);
    expect(await prisma.asset.count({ where: { uploadedById: { in: Object.values(users) } } })).toBe(before);
  });

  it('leaves drawn-map an ordinary tag', async () => {
    const res = await upload(player, { type: 'MAP', scope: 'USER', tags: 'drawn-map' });
    expect(res.status).toBe(201);
    expect(res.body.asset.tags).toEqual(['drawn-map']);
  });
});
