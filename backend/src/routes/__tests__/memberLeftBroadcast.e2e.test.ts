/**
 * Open pages hear when someone leaves the campaign.
 *
 * Each page keeps the campaign's member list and the roster panel's list
 * from when it loaded, and refreshes them on `roster.updated`. That was sent
 * when someone joined, never when someone left: a removed member, or one
 * whose account was deleted, stayed listed as a player on every other open
 * page, and Duplicate or Player Preview then acted for someone the server no
 * longer counted. A role change moved the controls but not the roster panel.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { randomUUID } from 'crypto';
import { PlatformRole } from '@prisma/client';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let adminId: string;
let campaignId: string;
let dm: ReturnType<typeof request.agent>;
const created: string[] = [];

type RosterUpdate = { action: string; userId: string; campaignId: string };

async function member(label: string): Promise<{ id: string; email: string }> {
  const user = await createTestUser({ email: `left-${label}-${randomUUID().slice(0, 8)}@test.cozyvtt.local`, displayName: label });
  created.push(user.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId, role: 'PLAYER', characterIds: [] } });
  return { id: user.id, email: user.email };
}

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `left-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const admin = await createTestUser({ email: `left-admin-${stamp}@test.cozyvtt.local`, displayName: 'Admin', role: PlatformRole.ADMIN });
  dmId = dmUser.id;
  adminId = admin.id;
  campaignId = (await createTestCampaign(dmId, { name: `Member left ${stamp}` })).id;
  await prisma.campaignMembership.create({ data: { userId: dmId, campaignId, role: 'DM', characterIds: [] } });
  dm = request.agent(app);
  expect((await dm.post('/api/auth/login').send({ email: dmUser.email, password: TEST_PASSWORD })).status).toBe(200);
  server = await createWsTestServer();
});

afterAll(async () => {
  await server.close();
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, adminId, ...created]);
  await prisma.$disconnect();
});

async function tableHears(act: () => Promise<number>, userId: string, action: string) {
  const table = await server.connectAndAuth(await server.loginAs(dmId), campaignId);
  const heard = waitForEvent<RosterUpdate>(table, 'roster.updated');
  expect(await act()).toBe(200);
  expect(await heard).toEqual({ action, userId, campaignId });
  table.disconnect();
}

it('tells the campaign when the DM removes a member', async () => {
  const gone = await member('removed');
  await tableHears(async () => (await dm.delete(`/api/campaigns/${campaignId}/members/${gone.id}`)).status, gone.id, 'member.left');
});

it('tells the campaign when a member deletes their own account', async () => {
  const gone = await member('self');
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: gone.email, password: TEST_PASSWORD })).status).toBe(200);
  await tableHears(async () => (await agent.delete('/api/auth/account').send({ password: TEST_PASSWORD })).status, gone.id, 'member.left');
});

it('tells the campaign when an admin deletes a member', async () => {
  const gone = await member('deleted');
  const admin = request.agent(app);
  const adminEmail = (await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).email;
  expect((await admin.post('/api/auth/login').send({ email: adminEmail, password: TEST_PASSWORD })).status).toBe(200);
  await tableHears(async () => (await admin.delete(`/api/users/${gone.id}`)).status, gone.id, 'member.left');
});

it('tells the campaign when a member changes role, so the roster panel regroups them', async () => {
  const moved = await member('moved');
  await tableHears(async () => (await dm.put(`/api/campaigns/${campaignId}/members/${moved.id}/role`).send({ role: 'SPECTATOR' })).status, moved.id, 'member.role');
});
