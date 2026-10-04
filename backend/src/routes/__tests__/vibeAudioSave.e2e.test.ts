/**
 * What a vibe period's audio may be set to.
 *
 * A period's audio names an asset the whole table will fetch while that
 * period is the vibe, so saving the periods asks the same question the
 * ambient setter asks: may this DM open this track to the room? Without
 * that, the period editor would be a second door past the check the
 * Atmosphere panel already makes.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

let dmId: string;
let outsiderId: string;
let campaignId: string;
let otherCampaignId: string;
let dm: ReturnType<typeof request.agent>;
let ownTrackId: string;
let campaignTrackId: string;
let strangersTrackId: string;
let otherCampaignTrackId: string;
let pictureId: string;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function asset(uploaderId: string, type: 'AUDIO' | 'TOKEN', scope: 'USER' | 'CAMPAIGN', inCampaignId: string | null, name: string) {
  const a = await prisma.asset.create({
    data: {
      type, scope, uploadedById: uploaderId, campaignId: inCampaignId,
      filename: `${name}.bin`, originalName: `${name}.bin`, mimeType: type === 'AUDIO' ? 'audio/mpeg' : 'image/png',
      fileSize: 1, filePath: `/nonexistent/${name}.bin`, name,
    },
  });
  return a.id;
}

const save = (audio: string | null) =>
  dm.put(`/api/campaigns/${campaignId}/vibe`).send({
    vibeSettings: {
      enabled: true,
      periods: [{ name: 'battle', hue: '#FF9966', filter: 'none', audio }],
    },
  });

beforeAll(async () => {
  const stamp = Date.now();
  const [d, o] = await Promise.all([
    createTestUser({ email: `vibesave-dm-${stamp}@test.cozyvtt.local`, displayName: 'VibeSave DM' }),
    createTestUser({ email: `vibesave-outsider-${stamp}@test.cozyvtt.local`, displayName: 'VibeSave Outsider' }),
  ]);
  dmId = d.id;
  outsiderId = o.id;

  campaignId = (await createTestCampaign(dmId, { name: `VibeSave ${stamp}` })).id;
  otherCampaignId = (await createTestCampaign(outsiderId, { name: `VibeSave other ${stamp}` })).id;
  await prisma.campaignMembership.create({
    data: { userId: dmId, campaignId, role: 'DM', characterIds: [] },
  });

  ownTrackId = await asset(dmId, 'AUDIO', 'USER', null, 'own-drums');
  campaignTrackId = await asset(dmId, 'AUDIO', 'CAMPAIGN', campaignId, 'table-theme');
  strangersTrackId = await asset(outsiderId, 'AUDIO', 'USER', null, 'private-recording');
  otherCampaignTrackId = await asset(outsiderId, 'AUDIO', 'CAMPAIGN', otherCampaignId, 'their-theme');
  pictureId = await asset(dmId, 'TOKEN', 'USER', null, 'a-picture');

  dm = await login(`vibesave-dm-${stamp}@test.cozyvtt.local`);
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: [dmId, outsiderId] } } });
  await cleanupCampaigns([campaignId, otherCampaignId]);
  await cleanupUsers([dmId, outsiderId]);
  await prisma.$disconnect();
});

describe('saving vibe periods with audio', () => {
  it("accepts the DM's own track, a campaign track, and no track", async () => {
    for (const audio of [ownTrackId, campaignTrackId, null]) {
      const res = await save(audio);
      expect(res.status).toBe(200);
    }
    const stored = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { vibeSettings: true } });
    const periods = (stored?.vibeSettings as { periods: Array<{ audio: string | null }> }).periods;
    expect(periods[0].audio).toBeNull();
  });

  it('refuses a track the DM cannot open to the room, naming the period', async () => {
    for (const audio of [strangersTrackId, otherCampaignTrackId, randomUUID()]) {
      const res = await save(audio);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('battle');
    }
  });

  it('refuses an asset that is not audio', async () => {
    const res = await save(pictureId);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('battle');
  });

  it('refuses a value that is not an asset id', async () => {
    const res = await save('birds_chirping.mp3');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('battle');
  });
});
