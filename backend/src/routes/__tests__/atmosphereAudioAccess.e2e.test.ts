/**
 * Atmosphere audio reaching the players.
 *
 * When the DM picks a track, the server does not stream it to anyone. It
 * broadcasts the track's URL and every player's browser fetches the file from
 * GET /api/assets/audio/:id with that player's own session. So whether the
 * table hears anything is decided by that route's read rule, and its rule was
 * a hand copy that knew only scope: a track from the DM's personal library was
 * readable by the DM alone, and every player got 403 and silence.
 *
 * The map route had the same bug and the same fix: access follows use. A
 * member may read an asset the campaign is using, here the track recorded in
 * the campaign's atmosphereAudio setting, for as long as it is recorded there.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyvtt-atmo-audio-'));

let dmId: string;
let playerId: string;
let strangerId: string;
let campaignId: string;
let trackId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let stranger: ReturnType<typeof request.agent>;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** A personal track in the DM's own library, with a real file behind it. */
async function personalTrack(name: string): Promise<string> {
  const filePath = path.join(dir, `${name}.mp3`);
  // ID3v2 header and nothing else: enough for a stat and a byte range.
  fs.writeFileSync(filePath, Buffer.concat([Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'), Buffer.alloc(64)]));
  const asset = await prisma.asset.create({
    data: {
      type: 'AUDIO', scope: 'USER', uploadedById: dmId,
      filename: `${name}.mp3`, originalName: `${name}.mp3`, mimeType: 'audio/mpeg',
      fileSize: 74, filePath, name,
    },
  });
  return asset.id;
}

const playing = (assetId: string | null) =>
  prisma.campaign.update({
    where: { id: campaignId },
    data: { vibeSettings: { atmosphereAudio: assetId ? { assetId, volume: 0.5, loop: true } : null } },
  });

const fetchTrack = (agent: ReturnType<typeof request.agent>, id: string) => agent.get(`/api/assets/audio/${id}`);

beforeAll(async () => {
  const stamp = Date.now();
  const [d, p, s] = await Promise.all([
    createTestUser({ email: `atmo-dm-${stamp}@test.cozyvtt.local`, displayName: 'Atmo DM' }),
    createTestUser({ email: `atmo-player-${stamp}@test.cozyvtt.local`, displayName: 'Atmo Player' }),
    createTestUser({ email: `atmo-stranger-${stamp}@test.cozyvtt.local`, displayName: 'Atmo Stranger' }),
  ]);
  dmId = d.id; playerId = p.id; strangerId = s.id;
  campaignId = (await createTestCampaign(dmId, { name: `Atmo ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  // One at a time: one address may have only two sign-ins checked at once.
  dm = await login(d.email);
  player = await login(p.email);
  stranger = await login(s.email);
  trackId = await personalTrack('rain');
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: dmId } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, strangerId]);
  await prisma.$disconnect();
  fs.rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => playing(null));

describe('a track from the DM\'s personal library', () => {
  it('is the DM\'s alone while nothing is playing', async () => {
    expect((await fetchTrack(dm, trackId)).status).toBe(200);
    expect((await fetchTrack(player, trackId)).status).toBe(404);
  });

  it('answers 404, not 403, so the reply does not confirm the id', async () => {
    expect((await fetchTrack(player, trackId)).status).toBe(404);
    expect((await fetchTrack(stranger, trackId)).status).toBe(404);
  });

  describe('once the DM sets it as the campaign\'s atmosphere', () => {
    beforeEach(() => playing(trackId));

    it('every member can fetch it', async () => {
      expect((await fetchTrack(player, trackId)).status).toBe(200);
    });

    it('someone outside the campaign still cannot', async () => {
      expect((await fetchTrack(stranger, trackId)).status).toBe(404);
    });

    it('a member can fetch a byte range, which is how an audio element plays it', async () => {
      const res = await fetchTrack(player, trackId).set('Range', 'bytes=0-9');
      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe('bytes 0-9/74');
    });

    it('a different personal track of the DM\'s stays private', async () => {
      const other = await personalTrack('wind');
      expect((await fetchTrack(player, other)).status).toBe(404);
    });
  });

  describe('what the serving route puts on the wire', () => {
    beforeEach(() => playing(trackId));

    it('chooses the content type from the file, never from what the uploader declared', async () => {
      // The stored mimeType is whatever the uploading browser put in the
      // multipart part. Validation checks the bytes, not that field, so it
      // can say anything. A file that begins like an MP3 and continues as
      // HTML, declared text/html, would be rendered as a page on this
      // instance's origin by anyone who opened its URL.
      const filePath = path.join(dir, 'polyglot.mp3');
      fs.writeFileSync(
        filePath,
        Buffer.concat([
          Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00'),
          Buffer.from('<html><script>window.__pwned = true</script></html>'),
        ])
      );
      const polyglot = await prisma.asset.create({
        data: {
          type: 'AUDIO', scope: 'USER', uploadedById: dmId,
          filename: 'polyglot.mp3', originalName: 'polyglot.mp3', mimeType: 'text/html',
          fileSize: 62, filePath, name: 'Polyglot',
        },
      });
      const res = await fetchTrack(dm, polyglot.id);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^audio\/mpeg/);
      expect(res.headers['content-type']).not.toMatch(/html/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('serves each allowed format as itself', async () => {
      for (const [ext, mime] of [['ogg', 'audio/ogg'], ['wav', 'audio/wav']] as const) {
        const filePath = path.join(dir, `track.${ext}`);
        fs.writeFileSync(filePath, Buffer.alloc(16));
        const asset = await prisma.asset.create({
          data: {
            type: 'AUDIO', scope: 'USER', uploadedById: dmId,
            filename: `track.${ext}`, originalName: `track.${ext}`, mimeType: 'application/octet-stream',
            fileSize: 16, filePath, name: `Track ${ext}`,
          },
        });
        expect((await fetchTrack(dm, asset.id)).headers['content-type']).toMatch(new RegExp(`^${mime}`));
      }
    });
  });

  it('is private again once the DM stops it', async () => {
    await playing(trackId);
    expect((await fetchTrack(player, trackId)).status).toBe(200);
    await playing(null);
    expect((await fetchTrack(player, trackId)).status).toBe(404);
  });
});
