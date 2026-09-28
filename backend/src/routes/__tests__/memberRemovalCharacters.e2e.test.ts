/**
 * A member removed from a campaign takes their characters with them.
 *
 * Removing a member deleted the membership and left each of their characters
 * pointing at the campaign, so the remaining members could go on reading the
 * sheets, the DM could go on editing them, and every save the owner made was
 * still sent to the campaign they had left.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

const app = createTestApp();
let dmId: string;
let leaverId: string;
let stayerId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
let stayer: ReturnType<typeof request.agent>;
let leaver: ReturnType<typeof request.agent>;
let server: WsTestServer;

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email, password: TEST_PASSWORD })).status).toBe(200);
  return agent;
}

const sheet = (userId: string, name: string) =>
  prisma.character.create({ data: { id: randomUUID(), userId, campaignId, name, data: {} } });

beforeAll(async () => {
  const [dmUser, leaverUser, stayerUser] = await Promise.all([
    createTestUser({ displayName: 'Removal DM' }),
    createTestUser({ displayName: 'Removal Leaver' }),
    createTestUser({ displayName: 'Removal Stayer' }),
  ]);
  dmId = dmUser.id;
  leaverId = leaverUser.id;
  stayerId = stayerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: 'Member removal' })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: leaverId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: stayerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  [dm, stayer, leaver] = await Promise.all([login(dmUser.email), login(stayerUser.email), login(leaverUser.email)]);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await prisma.character.deleteMany({ where: { userId: { in: [dmId, leaverId, stayerId] } } });
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, leaverId, stayerId]);
  await prisma.$disconnect();
});

it("takes the removed member's characters out of the campaign", async () => {
  const character = await sheet(leaverId, 'Leaving Hero');
  await prisma.campaignMembership.update({
    where: { userId_campaignId: { userId: leaverId, campaignId } },
    data: { characterIds: [character.id] },
  });
  expect((await stayer.get(`/api/characters/${character.id}`)).status).toBe(200);

  expect((await dm.delete(`/api/campaigns/${campaignId}/members/${leaverId}`)).status).toBe(200);

  expect((await prisma.character.findUniqueOrThrow({ where: { id: character.id } })).campaignId).toBeNull();
  expect((await stayer.get(`/api/characters/${character.id}`)).status).toBe(403);
  expect((await dm.put(`/api/characters/${character.id}`).send({ name: 'Renamed' })).status).toBe(403);
});

// Characters left behind by removals before this was fixed still name the
// campaign; they are the owner's alone once the owner is not a member.
it("keeps a character that still names the campaign from its owner's former table", async () => {
  await prisma.campaignMembership.deleteMany({ where: { userId: leaverId, campaignId } });
  const orphan = await sheet(dmId, 'placeholder');
  await prisma.character.update({ where: { id: orphan.id }, data: { userId: leaverId, name: 'Left Behind' } });

  expect((await stayer.get(`/api/characters/${orphan.id}`)).status).toBe(403);
  expect((await dm.put(`/api/characters/${orphan.id}`).send({ name: 'Renamed' })).status).toBe(403);
  const listed = await dm.get(`/api/campaigns/${campaignId}`);
  expect(listed.status).toBe(200);
  expect(JSON.stringify(listed.body)).not.toContain('Left Behind');
});

it("does not send the owner's saves of such a character to the campaign", async () => {
  await prisma.campaignMembership.deleteMany({ where: { userId: leaverId, campaignId } });
  const orphan = await sheet(dmId, 'placeholder');
  await prisma.character.update({ where: { id: orphan.id }, data: { userId: leaverId, name: 'Still Saving' } });
  const table = await server.connectAndAuth(await server.loginAs(stayerId), campaignId);
  const quiet = expectNoEvent(table, 'character.updated', 800);

  expect((await leaver.put(`/api/characters/${orphan.id}`).send({ name: 'Saved Elsewhere' })).status).toBe(200);
  await quiet;
  table.disconnect();
});
