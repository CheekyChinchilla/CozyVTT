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
