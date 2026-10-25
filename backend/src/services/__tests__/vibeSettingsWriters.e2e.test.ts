/**
 * The writers of a campaign's vibe settings do not undo each other.
 *
 * The vibe periods, the ambient track and the weather are kept in one JSON
 * column, and each writer read the whole column and wrote it back with its
 * own part changed. Two writes close together lost one of them: periods
 * saved while the DM changed the track put the old track back, and a track
 * set as the periods were saved put the old periods back. Saving the periods
 * also wrote back the weather the period editor had loaded, so weather set
 * after the page opened was lost. Each writer now changes only its own part,
 * in one statement.
 *
 * The stale reads below stand for the other write landing between a
 * writer's read and its write.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import type { Server } from 'socket.io';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { prisma as appPrisma } from '../../config/database';
import { toJson, readJsonObject } from '../../utils/prisma-json';
import { setCampaignAmbientAudio, setCampaignAtmosphereEffect } from '../atmosphereAudio';

const app = createTestApp();
const quietIo = { to: () => ({ emit: () => true }) } as unknown as Server;

let dmId: string;
let campaignId: string;
let trackId: string;
let dm: ReturnType<typeof request.agent>;

const dawn = { name: 'Dawn', hue: '#FFB347', filter: 'none', audio: null };
const dusk = { name: 'Dusk', hue: '#8E7CC3', filter: 'none', audio: null };

beforeAll(async () => {
  const user = await createTestUser({ displayName: 'Vibe Writers' });
  dmId = user.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Writers' })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  trackId = (await prisma.asset.create({
    data: {
      type: 'AUDIO', scope: 'CAMPAIGN', uploadedById: dmId, campaignId, filename: 'rain.ogg', originalName: 'rain.ogg',
      mimeType: 'audio/ogg', fileSize: 1, filePath: '/nonexistent/rain.ogg', name: 'Rain',
    },
  })).id;
  dm = request.agent(app);
  await dm.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId]);
  await prisma.$disconnect();
});

async function store(vibeSettings: Record<string, unknown>) {
  await prisma.campaign.update({ where: { id: campaignId }, data: { vibeSettings: toJson(vibeSettings), currentVibe: null } });
}
const stored = async () =>
  readJsonObject((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { vibeSettings: true } })).vibeSettings) ?? {};

/** Make the next reads of the vibe settings (with `select` naming `keys`) return `stale`. */
function staleRead(keys: string, stale: Record<string, unknown>) {
  const real = appPrisma.campaign.findUnique.bind(appPrisma.campaign);
  jest.spyOn(appPrisma.campaign, 'findUnique').mockImplementation(((args: { select?: Record<string, boolean> }) =>
    Object.keys(args.select ?? {}).sort().join(',') === keys
      ? Promise.resolve({ currentVibe: null, vibeSettings: stale })
      : real(args as never)) as never);
}

it('keeps the weather when the periods are saved without it', async () => {
  await store({ enabled: true, periods: [dawn], atmosphereEffect: 'rain' });
  const res = await dm.put(`/api/campaigns/${campaignId}/vibe`).send({ vibeSettings: { enabled: true, periods: [dawn, dusk] } });
  expect(res.status).toBe(200);
  expect(await stored()).toMatchObject({ atmosphereEffect: 'rain', periods: [dawn, dusk] });
});

it('keeps a track set while the periods were being saved', async () => {
  await store({ enabled: true, periods: [dawn], atmosphereAudio: { assetId: trackId, volume: 0.5, loop: true } });
  staleRead('currentVibe,vibeSettings', { enabled: true, periods: [dawn] });
  const res = await dm.put(`/api/campaigns/${campaignId}/vibe`).send({ vibeSettings: { enabled: true, periods: [dawn, dusk] } });
  expect(res.status).toBe(200);
  expect((await stored()).atmosphereAudio).toMatchObject({ assetId: trackId });
});

it('keeps periods saved while a track was being set', async () => {
  await store({ enabled: true, periods: [dawn, dusk] });
  staleRead('vibeSettings', { enabled: true, periods: [dawn] });
  expect((await setCampaignAmbientAudio(quietIo, campaignId, dmId, trackId, { volume: 0.4 })).ok).toBe(true);
  expect(await stored()).toMatchObject({ periods: [dawn, dusk], atmosphereAudio: { assetId: trackId, volume: 0.4 } });
});

it('keeps periods saved while the weather was being set', async () => {
  await store({ enabled: true, periods: [dawn, dusk] });
  staleRead('vibeSettings', { enabled: true, periods: [dawn] });
  await setCampaignAtmosphereEffect(campaignId, 'snow');
  expect(await stored()).toMatchObject({ periods: [dawn, dusk], atmosphereEffect: 'snow' });
});
