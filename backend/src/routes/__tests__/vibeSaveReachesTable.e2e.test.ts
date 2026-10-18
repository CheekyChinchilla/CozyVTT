/**
 * Saving the vibe periods tells the table what the vibe now is.
 *
 * `PUT /api/campaigns/:campaignId/vibe` stored the periods and told nobody.
 * Every member's page kept the periods it loaded, so an edit to the period in
 * force changed nothing on screen until a reload, a period added and then
 * switched to showed "No vibe set" to the players, and a period renamed or
 * deleted left its tint and its track running. A change only to a period's
 * capitals kept the old spelling as the vibe, which pages match exactly.
 *
 * The save now sends every member `vibe.settings.updated` with the periods as
 * saved and the vibe they leave: the period in force, under its new spelling,
 * or none when it was renamed or deleted. The vibe owns the soundtrack, so its
 * track follows, unless the DM has another track playing over it.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { readJsonObject, toJson } from '../../utils/prisma-json';
import type { Socket as ClientSocket } from 'socket.io-client';

jest.setTimeout(30000);

type Period = { name: string; hue: string; filter: string; audio: string | null };
type SettingsSaved = { campaignId: string; currentVibe: string | null; vibeSettings: { periods: Period[] } };
type AudioUpdated = { assetId: string | null; volume: number };

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dawnTrack: string;
let battleTrack: string;
let dmRest: ReturnType<typeof request.agent>;
let player: ClientSocket;

const dawn = (over: Partial<Period> = {}): Period => ({ name: 'Dawn', hue: '#FFB347', filter: 'none', audio: dawnTrack, ...over });
const dusk: Period = { name: 'Dusk', hue: '#8E7CC3', filter: 'none', audio: null };

async function track(name: string) {
  return (await prisma.asset.create({
    data: {
      type: 'AUDIO', scope: 'CAMPAIGN', uploadedById: dmId, campaignId, filename: `${name}.ogg`, originalName: `${name}.ogg`,
      mimeType: 'audio/ogg', fileSize: 1, filePath: `/nonexistent/${name}.ogg`, name,
    },
  })).id;
}

/** The campaign in the vibe `Dawn`, its periods `periods`, playing `playing`. */
async function start(playing: string | null, periods: Period[] = [dawn(), dusk]) {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      currentVibe: 'Dawn',
      vibeSettings: toJson({ enabled: true, periods, atmosphereAudio: playing ? { assetId: playing, volume: 0.4, loop: true } : null }),
    },
  });
}

const save = (periods: Period[]) => dmRest.put(`/api/campaigns/${campaignId}/vibe`).send({ vibeSettings: { enabled: true, periods } });
const stored = async () => {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { currentVibe: true, vibeSettings: true } });
  return { currentVibe: campaign.currentVibe, atmosphereAudio: readJsonObject(campaign.vibeSettings)?.atmosphereAudio ?? null };
};

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `vibesave-table-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `vibesave-table-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Vibe save reaches the table ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  dawnTrack = await track('birdsong');
  battleTrack = await track('war-drums');
  dmRest = request.agent(app);
  expect((await dmRest.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

beforeEach(async () => {
  player = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
});

afterEach(() => {
  player.disconnect();
});

afterAll(async () => {
  await server.close();
  await prisma.asset.deleteMany({ where: { campaignId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('sends everyone an edited period in force, which stays the vibe', async () => {
  await start(dawnTrack);
  const saved = waitForEvent<SettingsSaved>(player, 'vibe.settings.updated');
  const noTrackChange = expectNoEvent(player, 'atmosphere.audio.updated', 500);
  expect((await save([dawn({ hue: '#FF0000' }), dusk])).status).toBe(200);

  const event = await saved;
  expect(event.campaignId).toBe(campaignId);
  expect(event.currentVibe).toBe('Dawn');
  expect(event.vibeSettings.periods[0]).toMatchObject({ name: 'Dawn', hue: '#FF0000' });
  await noTrackChange;
  expect(await stored()).toMatchObject({ currentVibe: 'Dawn', atmosphereAudio: { assetId: dawnTrack } });
});

it('takes the new spelling when only a period\'s capitals change', async () => {
  await start(dawnTrack);
  const saved = waitForEvent<SettingsSaved>(player, 'vibe.settings.updated');
  expect((await save([dawn({ name: 'dawn' }), dusk])).status).toBe(200);

  expect((await saved).currentVibe).toBe('dawn');
  expect((await stored()).currentVibe).toBe('dawn');
});

it('ends the vibe, and its track, when the period in force is renamed', async () => {
  await start(dawnTrack);
  const saved = waitForEvent<SettingsSaved>(player, 'vibe.settings.updated');
  const stopped = waitForEvent<AudioUpdated>(player, 'atmosphere.audio.updated');
  expect((await save([dawn({ name: 'Sunrise' }), dusk])).status).toBe(200);

  expect((await saved).currentVibe).toBeNull();
  expect((await stopped).assetId).toBeNull();
  expect(await stored()).toEqual({ currentVibe: null, atmosphereAudio: null });
});

it('leaves a track the DM put on over the vibe when the period in force is deleted', async () => {
  await start(battleTrack);
  const saved = waitForEvent<SettingsSaved>(player, 'vibe.settings.updated');
  const noTrackChange = expectNoEvent(player, 'atmosphere.audio.updated', 500);
  expect((await save([dusk])).status).toBe(200);

  expect((await saved).currentVibe).toBeNull();
  await noTrackChange;
  expect(await stored()).toMatchObject({ currentVibe: null, atmosphereAudio: { assetId: battleTrack } });
});

it('plays the new track of the period in force, at the table\'s volume', async () => {
  await start(dawnTrack);
  const changed = waitForEvent<AudioUpdated>(player, 'atmosphere.audio.updated');
  expect((await save([dawn({ audio: battleTrack }), dusk])).status).toBe(200);

  expect(await changed).toMatchObject({ assetId: battleTrack, volume: 0.4 });
  expect((await stored()).atmosphereAudio).toMatchObject({ assetId: battleTrack });
});

it('sends the periods when no vibe is in force, and starts nothing', async () => {
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentVibe: null, vibeSettings: toJson({ enabled: true, periods: [dawn(), dusk] }) } });
  const saved = waitForEvent<SettingsSaved>(player, 'vibe.settings.updated');
  const noTrack = expectNoEvent(player, 'atmosphere.audio.updated', 500);
  expect((await save([dawn(), dusk, { name: 'Night', hue: '#1A237E', filter: 'none', audio: null }])).status).toBe(200);

  const event = await saved;
  expect(event.currentVibe).toBeNull();
  expect(event.vibeSettings.periods.map((p) => p.name)).toEqual(['Dawn', 'Dusk', 'Night']);
  await noTrack;
});
