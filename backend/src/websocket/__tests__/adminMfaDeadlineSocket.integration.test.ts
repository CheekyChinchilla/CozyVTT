/**
 * An administrator past the two-factor deadline cannot use the live table.
 *
 * The REST gate (middleware/adminMfa) refuses such an administrator almost
 * everything. The socket handshake, and the check `authenticate` makes before
 * a socket joins a campaign, applied only the password-change gate, so the
 * administrator could still connect, join campaigns and act at tables. Both
 * now refuse them as they refuse a pending password change: "Unauthorized",
 * then the connection ends. The page then asks the REST API, whose 403 sends
 * the administrator to set up two-factor authentication.
 *
 * Within the 7 days, and once MFA is on, nothing changes; nor when the policy
 * cannot be read, as the REST gate lets the request through then.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { prisma as serverPrisma } from '../../config/database';
import { ADMIN_MFA_POLICY_MESSAGE, resetAdminMfaPolicyCache } from '../../services/adminMfaPolicy';
import { prisma, createTestUser, createTestCampaign, cleanupUsers, cleanupCampaigns } from '../../__tests__/helpers/db';
import { createWsTestServer, waitForEvent, expectNoEvent, type WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(30000);

const DAY = 24 * 60 * 60 * 1000;

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

/** Make the account `ageDays` old, which puts its deadline that many days less 7 behind it. */
function age(userId: string, ageDays: number) {
  return prisma.user.update({ where: { id: userId }, data: { createdAt: new Date(Date.now() - ageDays * DAY) } });
}

/** An administrator created `ageDays` ago, DM of a campaign, with a cookie for a session of theirs. */
async function admin(ageDays: number, opts: { mfa?: boolean } = {}) {
  const user = await createTestUser({ displayName: 'Socket admin', role: 'ADMIN' });
  users.push(user.id);
  await age(user.id, ageDays);
  if (opts.mfa) await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaSecret: 'JBSWY3DPEHPK3PXP' } });
  const campaign = await createTestCampaign(user.id);
  campaigns.push(campaign.id);
  await prisma.campaignMembership.create({ data: { userId: user.id, campaignId: campaign.id, role: 'DM', characterIds: [] } });
  // What a sign-in leaves in the session (routes/auth.ts).
  const cookie = await server.sessionWith({ userId: user.id, platformRole: 'ADMIN', mustChangePassword: false, signedInAt: Date.now() });
  return { user, campaignId: campaign.id, cookie };
}

beforeAll(async () => {
  // The policy started on this instance long ago, so an old administrator's
  // deadline has passed; a new one still has the whole grace period.
  await prisma.systemLog.updateMany({ where: { message: ADMIN_MFA_POLICY_MESSAGE }, data: { createdAt: new Date(Date.now() - 30 * DAY) } });
  if ((await prisma.systemLog.count({ where: { message: ADMIN_MFA_POLICY_MESSAGE } })) === 0) {
    await prisma.systemLog.create({ data: { level: 'INFO', message: ADMIN_MFA_POLICY_MESSAGE, createdAt: new Date(Date.now() - 30 * DAY) } });
  }
  resetAdminMfaPolicyCache();
  server = await createWsTestServer();
});

afterAll(async () => {
  for (const client of clients) client.disconnect();
  await server.close();
  await cleanupCampaigns(campaigns);
  await cleanupUsers(users);
  await prisma.$disconnect();
});

it('refuses the connection to an administrator past the deadline', async () => {
  const { cookie } = await admin(10);

  expect(await attempt(cookie)).toEqual({ accepted: false, message: 'Unauthorized' });
});

// A connection opened within the 7 days stays open after them; the next
// campaign it asks to join is where it is stopped.
it('refuses to let a connection join a campaign once its administrator is past the deadline', async () => {
  const { user, campaignId, cookie } = await admin(0);
  const client = await server.connectAndAuth(cookie, campaignId);

  await age(user.id, 10);

  const joined = expectNoEvent(client, 'authenticated', 800);
  const refused = waitForEvent<{ message: string }>(client, 'error');
  const dropped = new Promise<string>((resolve) => client.on('disconnect', (reason: string) => resolve(reason)));
  client.emit('authenticate', { campaignId });
  expect((await refused).message).toBe('Unauthorized');
  await expect(joined).resolves.toBeUndefined();
  expect(await dropped).toBe('io server disconnect');
});

it('lets an administrator within the 7 days, and one with MFA on, connect and join a campaign', async () => {
  const fresh = await admin(0);
  (await server.connectAndAuth(fresh.cookie, fresh.campaignId)).disconnect();

  const enrolled = await admin(10, { mfa: true });
  (await server.connectAndAuth(enrolled.cookie, enrolled.campaignId)).disconnect();
});

it('lets the administrator connect and join when the policy cannot be read, as the REST gate does', async () => {
  const { cookie, campaignId } = await admin(10);
  resetAdminMfaPolicyCache();
  const unreadable = jest.spyOn(serverPrisma.systemLog, 'findFirst').mockRejectedValue(new Error('database unavailable'));
  try {
    (await server.connectAndAuth(cookie, campaignId)).disconnect();
  } finally {
    unreadable.mockRestore();
    resetAdminMfaPolicyCache();
  }
});
