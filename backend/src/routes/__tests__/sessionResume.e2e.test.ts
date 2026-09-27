/**
 * Resuming a paused session keeps the table exactly as it is.
 *
 * Pausing takes a snapshot of the current map's tokens, the active map, the
 * vibe and the spirit layer, kept with the session record. Resume used to
 * write that snapshot back over the live state, so anything the DM did
 * during the break was undone: a token hidden during the pause came back
 * visible and was sent to players again, a moved token jumped back, a token
 * added during the pause vanished, and a map switch was reverted. Nothing
 * told the DM. The live state is already saved as they play, so there is
 * nothing to restore; resume now only reopens the session.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';

// The session routes tell the table over the socket; there is none here.
jest.mock('../../websocket/utils', () => ({
  ...jest.requireActual('../../websocket/utils'),
  broadcastToCampaign: jest.fn(),
}));

import { createTestApp } from '../../__tests__/helpers/test-app';
import { readTokens } from '../../utils/prisma-json';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

describe('PUT /api/campaigns/:campaignId/resume', () => {
  let dmId: string;
  let campaignId: string;
  let mapId: string;
  let otherMapId: string;
  let sessionId: string;
  let dm: ReturnType<typeof request.agent>;

  const base = { imageUrl: '', size: { width: 1, height: 1 }, layer: 'token', visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {} };
  const tokensOf = async (id: string) => readTokens((await prisma.map.findUniqueOrThrow({ where: { id }, select: { tokens: true } })).tokens);

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Resume DM' });
    dmId = dmUser.id;
    campaignId = (await createTestCampaign(dmId, { name: 'Resume' })).id;
    await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
    const mapData = (name: string) => ({
      campaignId, name, imageUrl: '/api/assets/maps/placeholder', baseLayerUrl: '/api/assets/maps/placeholder',
      width: 20, height: 20, gridSize: 50, annotations: [],
    });
    mapId = (await prisma.map.create({ data: { ...mapData('Tavern'), tokens: [{ ...base, id: 'boss', name: 'Goblin Boss', position: { x: 4, y: 2 } }] } })).id;
    otherMapId = (await prisma.map.create({ data: { ...mapData('Cellar'), tokens: [] } })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.session.deleteMany({ where: { campaignId } });
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId]);
    await prisma.$disconnect();
  });

  it('keeps everything the DM changed during the pause', async () => {
    const started = await dm.post(`/api/campaigns/${campaignId}/sessions`).send({});
    expect(started.status).toBe(201);
    sessionId = started.body.session.id;
    expect((await dm.put(`/api/campaigns/${campaignId}/sessions/${sessionId}/pause`)).status).toBe(200);

    // During the break: hide and move the boss, add an ambusher, switch maps.
    expect((await dm.put(`/api/campaigns/${campaignId}/maps/${mapId}/tokens/boss`).send({ visible: false, position: { x: 8, y: 8 } })).status).toBe(200);
    expect((await dm.post(`/api/campaigns/${campaignId}/maps/${mapId}/tokens`).send({ name: 'Ambusher', position: { x: 1, y: 1 }, visible: false })).status).toBe(201);
    expect((await dm.put(`/api/campaigns/${campaignId}/maps/${otherMapId}/set-current`)).status).toBe(200);

    const resumed = await dm.put(`/api/campaigns/${campaignId}/resume`);
    expect(resumed.status).toBe(200);

    const tokens = await tokensOf(mapId);
    expect(tokens.find((t) => t.id === 'boss')).toMatchObject({ visible: false, position: { x: 8, y: 8 } });
    expect(tokens.some((t) => t.name === 'Ambusher')).toBe(true);
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(campaign.currentMapId).toBe(otherMapId);
    expect(campaign.status).toBe('ACTIVE');
    expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).endedAt).toBeNull();
  });

  it('reopens a paused session that holds no snapshot at all', async () => {
    expect((await dm.put(`/api/campaigns/${campaignId}/sessions/${sessionId}/pause`)).status).toBe(200);
    await prisma.$executeRaw`UPDATE "Session" SET "savedState" = NULL WHERE id = ${sessionId}`;

    const resumed = await dm.put(`/api/campaigns/${campaignId}/resume`);
    expect(resumed.status).toBe(200);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).status).toBe('ACTIVE');
  });
});
