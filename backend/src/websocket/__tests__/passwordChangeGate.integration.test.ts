/**
 * An account that must replace an admin-issued password cannot open a live
 * table connection until it has, as the REST gate refuses it everything else.
 *
 * The socket is turned away at the handshake: told "Unauthorized" and
 * disconnected, before it can send `authenticate` for any campaign.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { createWsTestServer, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

let server: WsTestServer;
const users: string[] = [];
const campaigns: string[] = [];
const clients: ClientSocket[] = [];

/** How a connection attempt ended: accepted, or refused with a message. */
function attempt(cookie: string): Promise<{ accepted: boolean; message?: string }> {
  return new Promise((resolve, reject) => {
    const client = ioc(server.url, { transports: ['websocket'], extraHeaders: { cookie }, forceNew: true, reconnection: false });
    clients.push(client);
    const timer = setTimeout(() => reject(new Error('no answer to the connection within 5s')), 5000);
    client.once('connected', () => {
      clearTimeout(timer);
      resolve({ accepted: true });
    });
    client.once('error', (err: { message: string }) => {
      clearTimeout(timer);
      resolve({ accepted: false, message: err.message });
    });
  });
}

beforeAll(async () => {
  server = await createWsTestServer();
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  await server.close();
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

it('refuses the connection while the password change is pending', async () => {
  const user = await createTestUser({ displayName: 'Must change' });
  users.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
  const campaign = await createTestCampaign(user.id);
  campaigns.push(campaign.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign.id, role: 'DM', characterIds: [] } });

  const cookie = await server.loginAs(user.id);

  expect(await attempt(cookie)).toEqual({ accepted: false, message: 'Unauthorized' });
});

it('accepts it once the password has been changed', async () => {
  const user = await createTestUser({ displayName: 'Changed it' });
  users.push(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
  const cookie = await server.loginAs(user.id);
  expect((await attempt(cookie)).accepted).toBe(false);

  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });

  expect(await attempt(cookie)).toEqual({ accepted: true });
});
