/**
 * A role change reaches the browsers already open.
 *
 * The server took the new role onto the member's live connections at once,
 * but told no browser, so the member's page kept the old role's controls
 * until reloaded: a promoted spectator could not move the token they had
 * just been given, and a demoted player was offered dice the server then
 * refused. The route now tells the whole campaign.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { toJson } from '../../utils/prisma-json';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `rolechg-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `rolechg-p-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Role change ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it("tells the member's open connections, and everyone else in the campaign, the new role", async () => {
  const member = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
  const table = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const toMember = waitForEvent<{ campaignId: string; userId: string; role: string }>(member, 'campaign.role.changed');
  const toTable = waitForEvent<{ userId: string; role: string }>(table, 'campaign.role.changed');

  const res = await dm.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: 'SPECTATOR' });
  expect(res.status).toBe(200);

  expect(await toMember).toEqual({ campaignId, userId: playerId, role: 'SPECTATOR' });
  expect(await toTable).toMatchObject({ userId: playerId, role: 'SPECTATOR' });
  member.disconnect();
  table.disconnect();
});

// What a member is sent of the map depends on their role: a spectator on a lit
// map is sent no tokens. The controls followed the new role but the map the
// page held did not, so a spectator made a player again had nothing to move
// until the next map switch. The map is lit and holds the member's token, so
// what arrives depends on which role it was filtered for.
const litMapWith = async (tokens: Record<string, unknown>[]) => {
  const mapId = (await prisma.map.create({
    data: {
      campaignId, name: 'Shown', imageUrl: '/api/assets/maps/x', baseLayerUrl: '/api/assets/maps/x',
      width: 10, height: 10, gridSize: 50, annotations: [], lightingEnabled: true, globalIllumination: true, tokens: toJson(tokens),
    },
  })).id;
  await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: mapId } });
  return mapId;
};
const mapToken = (id: string, controlledBy: string | null, changes: Record<string, unknown> = {}) => ({
  id, name: id, imageUrl: '', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, layer: 'token', visible: true,
  controlledBy, rotation: 0, conditions: [], metadata: {}, ...changes,
});
type Resent = { mapId: string; mapData: { tokens: { id: string; notes?: string }[] } };

it("sends the member the map the table is on again, as their new role sees it", async () => {
  const mapId = await litMapWith([mapToken('theirs', playerId)]);
  await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { role: 'SPECTATOR' } });
  try {
    const member = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const promoted = waitForEvent<Resent>(member, 'map.changed');
    expect((await dm.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: 'PLAYER' })).status).toBe(200);
    const asPlayer = await promoted;
    expect(asPlayer.mapId).toBe(mapId);
    expect(asPlayer.mapData.tokens.map((t) => t.id)).toEqual(['theirs']);

    const demoted = waitForEvent<Resent>(member, 'map.changed');
    expect((await dm.put(`/api/campaigns/${campaignId}/members/${playerId}/role`).send({ role: 'SPECTATOR' })).status).toBe(200);
    expect((await demoted).mapData.tokens).toEqual([]);
    member.disconnect();
  } finally {
    await prisma.campaignMembership.update({ where: { userId_campaignId: { userId: playerId, campaignId } }, data: { role: 'PLAYER' } });
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.map.deleteMany({ where: { id: mapId } });
  }
});

// Handing over the DM's seat changes two roles at once, and the open pages
// need what a role change gives them: the roster regrouped, and the map as
// each new role sees it. The new DM's page held a player's map, with no
// hidden creatures and no notes; the old DM's held the DM's.
it('re-sends the map to both sides of a DM handover, and regroups the roster', async () => {
  const mapId = await litMapWith([mapToken('theirs', playerId), mapToken('lurker', null, { visible: false, notes: 'ambush' })]);
  try {
    const incoming = await server.connectAndAuth(await server.loginAs(playerId), campaignId);
    const outgoing = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
    const toIncoming = waitForEvent<Resent>(incoming, 'map.changed');
    const toOutgoing = waitForEvent<Resent>(outgoing, 'map.changed');
    const regrouped = new Promise<string[]>((resolve) => {
      const ids: string[] = [];
      outgoing.on('roster.updated', (e: { userId: string; action: string }) => {
        if (e.action === 'member.role') ids.push(e.userId);
        if (ids.length === 2) resolve(ids);
      });
    });

    expect((await dm.put(`/api/campaigns/${campaignId}/dm`).send({ userId: playerId })).status).toBe(200);

    const asDm = await toIncoming;
    expect(asDm.mapId).toBe(mapId);
    expect(asDm.mapData.tokens.find((t) => t.id === 'lurker')?.notes).toBe('ambush');
    expect((await toOutgoing).mapData.tokens.map((t) => t.id)).toEqual([]);
    expect((await regrouped).sort()).toEqual([dmId, playerId].sort());
    incoming.disconnect();
    outgoing.disconnect();
  } finally {
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentMapId: null } });
    await prisma.map.deleteMany({ where: { id: mapId } });
  }
});
