/**
 * The vibe owns the soundtrack: switching to a period with an audio track
 * starts it looping for the whole table, and switching to one without a track
 * silences the table. The switch goes through the same setter as the
 * Atmosphere panel, so the asset checks, the persisted state and the
 * broadcast are the ones that pipeline already has.
 *
 * A period's stored audio can also be junk: a free-text note from before the
 * field became a track picker, or the id of an asset that has since been
 * deleted or was never the GM's to open. A note counts quietly as no track;
 * a dead id silences the table and tells the GM, but never blocks the switch.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import {
  createWsTestServer,
  waitForEvent,
  expectNoEvent,
  WsTestServer,
} from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `vibeaudio-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let gmId: string;
let playerId: string;
let outsiderId: string;
let campaignId: string;
let gmCookie: string;
let playerCookie: string;
let trackId: string;
let strangersTrackId: string;

interface AudioUpdated {
  assetId: string | null;
  audioUrl: string | null;
  volume: number;
  loop: boolean;
}

async function audioAsset(uploaderId: string, scope: 'USER' | 'GLOBAL', name: string): Promise<string> {
  const asset = await prisma.asset.create({
    data: {
      type: 'AUDIO', scope, uploadedById: uploaderId,
      filename: `${name}.mp3`, originalName: `${name}.mp3`, mimeType: 'audio/mpeg',
      fileSize: 1, filePath: `/nonexistent/${name}.mp3`, name,
    },
  });
  return asset.id;
}

async function storedState(): Promise<{ currentVibe: string | null; ambientAssetId: string | null }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { currentVibe: true, vibeSettings: true },
  });
  const settings = campaign?.vibeSettings as { atmosphereAudio?: { assetId?: string } | null } | null;
  return {
    currentVibe: campaign?.currentVibe ?? null,
    ambientAssetId: settings?.atmosphereAudio?.assetId ?? null,
  };
}

async function setPeriods(periods: Array<{ name: string; audio: string | null }>): Promise<void> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { vibeSettings: true },
  });
  const existing = (campaign?.vibeSettings ?? {}) as Record<string, unknown>;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      vibeSettings: {
        ...existing,
        enabled: true,
        periods: periods.map((p) => ({ name: p.name, hue: '#FF9966', filter: 'none', audio: p.audio })),
      },
    },
  });
}

beforeAll(async () => {
  const [gm, player, outsider] = await Promise.all(
    ['dm', 'player', 'outsider'].map((name) =>
      prisma.user.create({
        data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `VibeAudio ${name}` },
      })
    )
  );
  gmId = gm.id;
  playerId = player.id;
  outsiderId = outsider.id;

  campaignId = (await prisma.campaign.create({
    data: { name: `VibeAudio ${runId}`, ownerId: gmId, vibeSettings: {} },
  })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  trackId = await audioAsset(gmId, 'USER', 'battle-drums');
  strangersTrackId = await audioAsset(outsiderId, 'USER', 'private-recording');

  server = await createWsTestServer();
  gmCookie = await server.loginAs(gmId);
  playerCookie = await server.loginAs(playerId);
});

afterAll(async () => {
  await server?.close();
  await prisma.asset.deleteMany({ where: { uploadedById: { in: [gmId, outsiderId] } } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId, outsiderId] } } });
  await prisma.$disconnect();
});

describe('a vibe switch drives the ambient track', () => {
  it("a period with a track starts it for the table, at the table's last volume", async () => {
    await setPeriods([{ name: 'battle', audio: trackId }, { name: 'camp', audio: null }]);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        vibeSettings: {
          enabled: true,
          periods: [
            { name: 'battle', hue: '#FF9966', filter: 'none', audio: trackId },
            { name: 'camp', hue: '#FF9966', filter: 'none', audio: null },
          ],
          atmosphereAudio: { assetId: trackId, volume: 0.8, loop: true },
        },
      },
    });

    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const vibe = waitForEvent(player, 'vibe.updated');
    const audio = waitForEvent<AudioUpdated>(player, 'atmosphere.audio.updated');
    gm.emit('vibe.update', { period: 'battle' });
    await vibe;
    const heard = await audio;
    expect(heard).toMatchObject({
      assetId: trackId,
      audioUrl: `/api/assets/audio/${trackId}`,
      volume: 0.8,
      loop: true,
    });
    expect(await storedState()).toEqual({ currentVibe: 'battle', ambientAssetId: trackId });
    gm.disconnect();
    player.disconnect();
  });

  it('a period with no track silences the table', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const audio = waitForEvent<AudioUpdated>(player, 'atmosphere.audio.updated');
    gm.emit('vibe.update', { period: 'camp' });
    expect((await audio).assetId).toBeNull();
    expect(await storedState()).toEqual({ currentVibe: 'camp', ambientAssetId: null });
    gm.disconnect();
    player.disconnect();
  });

  it('a free-text note from the old field counts quietly as no track', async () => {
    await setPeriods([{ name: 'legacy', audio: 'birds_chirping.mp3' }]);
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const audio = waitForEvent<AudioUpdated>(gm, 'atmosphere.audio.updated');
    const silence = expectNoEvent(gm, 'error');
    gm.emit('vibe.update', { period: 'legacy' });
    expect((await audio).assetId).toBeNull();
    await silence;
    gm.disconnect();
  });

  it("a track the GM cannot open silences the table, tells the GM, and the switch stands", async () => {
    await setPeriods([
      { name: 'stolen', audio: strangersTrackId },
      { name: 'gone', audio: randomUUID() },
    ]);
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const player = await server.connectAndAuth(playerCookie, campaignId);

    const vibe = waitForEvent(player, 'vibe.updated');
    const audio = waitForEvent<AudioUpdated>(player, 'atmosphere.audio.updated');
    const told = waitForEvent<{ message: string }>(gm, 'error');
    gm.emit('vibe.update', { period: 'stolen' });
    await vibe;
    expect((await audio).assetId).toBeNull();
    expect((await told).message).toMatch(/audio/i);
    expect(await storedState()).toEqual({ currentVibe: 'stolen', ambientAssetId: null });

    const told2 = waitForEvent<{ message: string }>(gm, 'error');
    gm.emit('vibe.update', { period: 'gone' });
    expect((await told2).message).toMatch(/audio/i);
    expect((await storedState()).currentVibe).toBe('gone');

    gm.disconnect();
    player.disconnect();
  });
});
