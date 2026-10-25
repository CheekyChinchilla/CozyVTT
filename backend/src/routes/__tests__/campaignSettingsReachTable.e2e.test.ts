/**
 * Saving Campaign Settings tells the table.
 *
 * `PUT /api/campaigns/:campaignId` stored the change and told nobody, so a
 * player already at the table kept the settings their page loaded. A chat
 * cooldown turned on reached them only when the server refused their second
 * message, and their chat box never counted down until they reloaded.
 *
 * The save now sends every member `campaign.settings.updated` with the
 * campaign's name, description, game system and chat cooldown as stored.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { prisma, createTestUser, createTestCampaign, cleanupCampaigns, cleanupUsers, TEST_PASSWORD } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import type { Socket as ClientSocket } from 'socket.io-client';

jest.setTimeout(30000);

type SettingsSaved = {
  campaignId: string; name: string; description: string | null; gameSystem: string | null;
  chatCooldownEnabled: boolean; chatCooldownSeconds: number;
};

const app = createTestApp();
let server: WsTestServer;
let dmId: string;
let playerId: string;
let campaignId: string;
let dmRest: ReturnType<typeof request.agent>;
let player: ClientSocket;

beforeAll(async () => {
  const stamp = randomUUID().slice(0, 8);
  const dmUser = await createTestUser({ email: `settings-table-dm-${stamp}@test.cozyvtt.local`, displayName: 'DM' });
  const playerUser = await createTestUser({ email: `settings-table-player-${stamp}@test.cozyvtt.local`, displayName: 'Player' });
  dmId = dmUser.id;
  playerId = playerUser.id;
  campaignId = (await createTestCampaign(dmId, { name: `Settings reach the table ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
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
  await cleanupCampaigns([campaignId]);
  await cleanupUsers([dmId, playerId]);
  await prisma.$disconnect();
});

it('sends every member the chat cooldown the DM turned on', async () => {
  const saved = waitForEvent<SettingsSaved>(player, 'campaign.settings.updated');
  const res = await dmRest.put(`/api/campaigns/${campaignId}`).send({ chatCooldownEnabled: true, chatCooldownSeconds: 7 });
  expect(res.status).toBe(200);

  expect(await saved).toMatchObject({ campaignId, chatCooldownEnabled: true, chatCooldownSeconds: 7 });
});

it('sends the name and description as stored', async () => {
  const saved = waitForEvent<SettingsSaved>(player, 'campaign.settings.updated');
  expect((await dmRest.put(`/api/campaigns/${campaignId}`).send({ name: '  The Drowned Bell ', description: '' })).status).toBe(200);

  expect(await saved).toMatchObject({ campaignId, name: 'The Drowned Bell', description: '' });
});

it('sends nothing for a refused save', async () => {
  const none = expectNoEvent(player, 'campaign.settings.updated', 500);
  expect((await dmRest.put(`/api/campaigns/${campaignId}`).send({ chatCooldownSeconds: 0 })).status).toBe(400);
  await none;
});
