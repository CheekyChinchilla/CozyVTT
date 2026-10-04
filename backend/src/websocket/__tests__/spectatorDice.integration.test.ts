/**
 * A spectator watches: they may write in chat, and they may not roll dice.
 *
 * The chat and dice handlers never checked the role; two helpers in
 * services/permissions said spectators could do neither, and nothing called
 * them. The rule, decided with the maintainer: chat yes, dice no.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, expectNoEvent, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const email = (name: string) => `spectator-${name}-${runId}@test.cozyvtt.local`;

let server: WsTestServer;
let dmId: string;
let watcherId: string;
let campaignId: string;
let dmCookie: string;
let watcherCookie: string;

beforeAll(async () => {
  const [dm, watcher] = await Promise.all(
    ['dm', 'watcher'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Spectator ${name}` } })
    )
  );
  dmId = dm.id; watcherId = watcher.id;
  const campaign = await prisma.campaign.create({ data: { name: `Spectators ${runId}`, ownerId: dmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: watcherId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  [dmCookie, watcherCookie] = await Promise.all([server.loginAs(dmId), server.loginAs(watcherId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, watcherId] } } });
  await prisma.$disconnect();
});

describe('a spectator', () => {
  it('is refused a dice roll, and nothing reaches the table or the history', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const watcher = await server.connectAndAuth(watcherCookie, campaignId);
    const nothing = expectNoEvent(dm, 'dice.rolled', 500);
    const denial = waitForEvent<{ message: string }>(watcher, 'error');
    watcher.emit('dice.roll', { expression: '1d20', purpose: 'a try' });
    expect((await denial).message).toMatch(/pectator/);
    await nothing;
    expect(await prisma.diceRoll.count({ where: { campaignId, userId: watcherId } })).toBe(0);
    dm.disconnect();
    watcher.disconnect();
  });

  it('may still write in chat', async () => {
    const dm = await server.connectAndAuth(dmCookie, campaignId);
    const watcher = await server.connectAndAuth(watcherCookie, campaignId);
    const heard = waitForEvent<{ content: string; userId: string }>(dm, 'chat.message');
    watcher.emit('chat.message', { content: 'Great fight so far', type: 'PLAYER' });
    const msg = await heard;
    expect(msg.content).toBe('Great fight so far');
    expect(msg.userId).toBe(watcherId);
    dm.disconnect();
    watcher.disconnect();
  });
});
