/**
 * Who may write the campaign's atmosphere track.
 *
 * Reading an asset follows its use, and one of the uses is the track a campaign
 * is playing, recorded at `Campaign.vibeSettings.atmosphereAudio.assetId`. The
 * socket handler that sets a track checks the DM may read the asset first, so a
 * track cannot be pointed at a stranger's file. Two REST routes write the same
 * JSON column and cannot make that check, so they must not set one: a DM could
 * otherwise park any asset id there and read the bytes back, for themselves and
 * for everyone at their table. An asset id is all it takes.
 *
 * They carry the stored track through instead, which also means an ordinary
 * settings update does not stop the music.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

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

/** A vibe settings blob the validator accepts. */
const VIBE = {
  enabled: false,
  periods: [{ name: 'Day', hue: '#FF9966', filter: 'none', audio: null }],
};

let dmId: string;
let playerId: string;
let outsiderId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let player: ReturnType<typeof request.agent>;
let outsider: ReturnType<typeof request.agent>;
/** A document belonging to the player, never shared with anyone. */
let privateDocId: string;

async function login(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const readDoc = (agent: ReturnType<typeof request.agent>, id: string) =>
  agent.get(`/api/assets/documents/${id}`);

beforeAll(async () => {
  const stamp = Date.now();
  // None of these are platform admins: an admin may read everything by design,
  // which would hide exactly the bug under test.
  const [d, p, o] = await Promise.all([
    createTestUser({ email: `track-dm-${stamp}@test.cozyvtt.local`, displayName: 'Track DM' }),
    createTestUser({ email: `track-player-${stamp}@test.cozyvtt.local`, displayName: 'Track Player' }),
    createTestUser({ email: `track-outsider-${stamp}@test.cozyvtt.local`, displayName: 'Track Outsider' }),
  ]);
  dmId = d.id; playerId = p.id; outsiderId = o.id;

  campaignId = (await createTestCampaign(dmId, { name: `Track ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });

  // One at a time: one address may have only two sign-ins checked at once.
  dm = await login(d.email);
  player = await login(p.email);
  outsider = await login(o.email);

  const created = await player
    .post('/api/assets/documents')
    .send({ name: 'Private notes', format: 'md', content: 'MY SECRET BACKSTORY', scope: 'USER' });
  expect(created.status).toBe(201);
  privateDocId = created.body.asset.id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { uploadedById: { in: [dmId, playerId, outsiderId] } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId, outsiderId]);
  await prisma.$disconnect();
});

beforeEach(() =>
  prisma.campaign.update({ where: { id: campaignId }, data: { vibeSettings: VIBE } })
);

describe('a DM writing the campaign settings', () => {
  it('cannot read a player\'s private document to begin with', async () => {
    expect((await readDoc(dm, privateDocId)).status).toBe(404);
  });

  it('cannot reach it by naming it as the track through PUT /:campaignId', async () => {
    const res = await dm
      .put(`/api/campaigns/${campaignId}`)
      .send({ vibeSettings: { ...VIBE, atmosphereAudio: { assetId: privateDocId } } });
    // The update itself may succeed; what must not happen is the grant.
    expect([200, 400]).toContain(res.status);
    expect((await readDoc(dm, privateDocId)).status).toBe(404);
  });

  it('cannot reach it through PUT /:campaignId/vibe either', async () => {
    const res = await dm
      .put(`/api/campaigns/${campaignId}/vibe`)
      .send({ vibeSettings: { ...VIBE, atmosphereAudio: { assetId: privateDocId } } });
    expect([200, 400]).toContain(res.status);
    expect((await readDoc(dm, privateDocId)).status).toBe(404);
  });

  it('does not hand the rest of the table a way in either', async () => {
    await dm
      .put(`/api/campaigns/${campaignId}`)
      .send({ vibeSettings: { ...VIBE, atmosphereAudio: { assetId: privateDocId } } });
    // The outsider is in no campaign at all; the player owns the file.
    expect((await readDoc(outsider, privateDocId)).status).toBe(404);
    expect((await readDoc(player, privateDocId)).status).toBe(200);
  });

  it('leaves a track that was properly set alone', async () => {
    // Written the way the socket handler writes it, having checked the DM can
    // read it. An ordinary settings update must not wipe it.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        vibeSettings: { ...VIBE, atmosphereAudio: { assetId: 'keep-me', volume: 0.5, loop: true } },
      },
    });

    await dm.put(`/api/campaigns/${campaignId}`).send({
      vibeSettings: {
        enabled: true,
        periods: [{ name: 'Night', hue: '#223366', filter: 'none', audio: null }],
      },
    });

    const after = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { vibeSettings: true },
    });
    const settings = after?.vibeSettings as {
      atmosphereAudio?: { assetId?: string };
      enabled?: boolean;
    };
    expect(settings.atmosphereAudio?.assetId).toBe('keep-me');
    expect(settings.enabled).toBe(true);
  });
});
