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
let gmId: string;
let watcherId: string;
let campaignId: string;
let gmCookie: string;
let watcherCookie: string;

beforeAll(async () => {
  const [gm, watcher] = await Promise.all(
    ['dm', 'watcher'].map((name) =>
      prisma.user.create({ data: { email: email(name), passwordHash: 'not-used-by-socket-auth', displayName: `Spectator ${name}` } })
    )
  );
  gmId = gm.id; watcherId = watcher.id;
  const campaign = await prisma.campaign.create({ data: { name: `Spectators ${runId}`, ownerId: gmId, vibeSettings: {} } });
  campaignId = campaign.id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: watcherId, campaignId, role: 'SPECTATOR', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  [gmCookie, watcherCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(watcherId)]);
});

afterAll(async () => {
  await server?.close();
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, watcherId] } } });
  await prisma.$disconnect();
});

describe('a spectator', () => {
  it('is refused a dice roll, and nothing reaches the table or the history', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const watcher = await server.connectAndAuth(watcherCookie, campaignId);
    const nothing = expectNoEvent(gm, 'dice.rolled', 500);
    const denial = waitForEvent<{ message: string }>(watcher, 'error');
    watcher.emit('dice.roll', { expression: '1d20', purpose: 'a try' });
    expect((await denial).message).toMatch(/pectator/);
    await nothing;
    expect(await prisma.diceRoll.count({ where: { campaignId, userId: watcherId } })).toBe(0);
    gm.disconnect();
    watcher.disconnect();
  });

  it('may still write in chat', async () => {
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const watcher = await server.connectAndAuth(watcherCookie, campaignId);
    const heard = waitForEvent<{ content: string; userId: string }>(gm, 'chat.message');
    watcher.emit('chat.message', { content: 'Great fight so far', type: 'PLAYER' });
    const msg = await heard;
    expect(msg.content).toBe('Great fight so far');
    expect(msg.userId).toBe(watcherId);
    gm.disconnect();
    watcher.disconnect();
  });
});
