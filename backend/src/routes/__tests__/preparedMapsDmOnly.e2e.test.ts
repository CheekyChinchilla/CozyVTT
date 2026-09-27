/**
 * A map the DM has prepared but not shown is the DM's alone.
 *
 * The map list gave every map in the campaign to any member, the map fetch
 * returned any of them, and the wall and light routes did the same, so a
 * scripted player could read a map before the DM switched to it: its
 * artwork, its walls and lights, and every token left visible on it. A
 * player is now sent the campaign's current map and nothing else, on every
 * path, until the DM shows the next one.
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

describe('a prepared map', () => {
  let dmId: string;
  let playerId: string;
  let campaignId: string;
  let shownId: string;
  let preparedId: string;
  let dm: ReturnType<typeof request.agent>;
  let player: ReturnType<typeof request.agent>;

  const mapData = (name: string) => ({
    campaignId,
    name,
    imageUrl: '/api/assets/maps/placeholder',
    baseLayerUrl: '/api/assets/maps/placeholder',
    width: 20,
    height: 16,
    gridSize: 50,
    annotations: [],
  });
  const aboleth = {
    id: 'aboleth', name: 'Aboleth', imageUrl: '', position: { x: 3, y: 3 }, size: { width: 2, height: 2 }, layer: 'token',
    visible: true, controlledBy: null, rotation: 0, conditions: [], metadata: {},
  };
  const wall = { id: 'w1', x1: 0, y1: 0, x2: 100, y2: 0, type: 'wall' };
  const lamp = { id: 'l1', x: 50, y: 50, brightRadius: 2, dimRadius: 4, color: '#ffcc88', enabled: true };

  beforeAll(async () => {
    const dmUser = await createTestUser({ displayName: 'Prepared Maps DM' });
    const playerUser = await createTestUser({ displayName: 'Prepared Maps Player' });
    dmId = dmUser.id;
    playerId = playerUser.id;
    const campaign = await createTestCampaign(dmId, { name: 'Prepared Maps' });
    campaignId = campaign.id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: dmId, campaignId, role: 'DM', characterIds: [] },
        { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      ],
    });
    shownId = (await prisma.map.create({ data: { ...mapData('The Ravine'), tokens: [] } })).id;
    preparedId = (await prisma.map.create({
      data: { ...mapData('The Crypt'), tokens: [aboleth], wallSegments: [wall], lights: [lamp] },
    })).id;
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: shownId } });

    dm = request.agent(app);
    await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD });
    player = request.agent(app);
    await player.post('/api/auth/login').send({ email: playerUser.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.map.deleteMany({ where: { campaignId } });
    await cleanupCampaigns([campaignId]);
    await cleanupUsers([dmId, playerId]);
    await prisma.$disconnect();
  });

  const ids = (maps: Array<{ id: string }>) => maps.map((m) => m.id).sort();

  it('is left out of the map list a player is sent, and listed to the DM', async () => {
    const theirs = await player.get(`/api/campaigns/${campaignId}/maps`);
    expect(theirs.status).toBe(200);
    expect(ids(theirs.body.maps)).toEqual([shownId]);
    const mine = await dm.get(`/api/campaigns/${campaignId}/maps`);
    expect(ids(mine.body.maps)).toEqual([preparedId, shownId].sort());
  });

  it('is not found for a player, and fetched whole by the DM', async () => {
    expect((await player.get(`/api/campaigns/${campaignId}/maps/${shownId}`)).status).toBe(200);
    const theirs = await player.get(`/api/campaigns/${campaignId}/maps/${preparedId}`);
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body)).not.toContain('Aboleth');
    const mine = await dm.get(`/api/campaigns/${campaignId}/maps/${preparedId}`);
    expect(mine.status).toBe(200);
    expect(mine.body.map.tokens[0].name).toBe('Aboleth');
  });

  it('keeps its walls and lights from a player', async () => {
    expect((await player.get(`/api/campaigns/${campaignId}/maps/${preparedId}/walls`)).status).toBe(404);
    expect((await player.get(`/api/campaigns/${campaignId}/maps/${preparedId}/lights`)).status).toBe(404);
    expect((await player.get(`/api/campaigns/${campaignId}/maps/${shownId}/walls`)).status).toBe(200);
    expect((await dm.get(`/api/campaigns/${campaignId}/maps/${preparedId}/walls`)).body.segments).toEqual([wall]);
    expect((await dm.get(`/api/campaigns/${campaignId}/maps/${preparedId}/lights`)).body.lights).toEqual([lamp]);
  });

  it('is left out of the campaign fetch a player is sent', async () => {
    const theirs = await player.get(`/api/campaigns/${campaignId}`);
    expect(theirs.status).toBe(200);
    expect(ids(theirs.body.campaign.maps)).toEqual([shownId]);
    const mine = await dm.get(`/api/campaigns/${campaignId}`);
    expect(ids(mine.body.campaign.maps)).toEqual([preparedId, shownId].sort());
  });

  it('reaches the player once the DM switches to it', async () => {
    expect((await dm.put(`/api/campaigns/${campaignId}/maps/${preparedId}/set-current`)).status).toBe(200);
    const theirs = await player.get(`/api/campaigns/${campaignId}/maps/${preparedId}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.map.tokens[0].name).toBe('Aboleth');
    expect(ids((await player.get(`/api/campaigns/${campaignId}/maps`)).body.maps)).toEqual([preparedId]);
    // And the one it replaced is the DM's again.
    expect((await player.get(`/api/campaigns/${campaignId}/maps/${shownId}`)).status).toBe(404);
  });
});
