/**
 * A chat message is answered.
 *
 * `chat.message` was sent and forgotten: a message lost while the connection
 * dropped, or refused, left the sender's copy reading "sending…" for good,
 * and a refusal came as a general `error` that every panel listening for
 * errors took as its own (the dice panel showed chat refusals). A client
 * that passes an acknowledgement now gets `{ ok: true, id }` or
 * `{ ok: false, error }` for its message and nothing else. It may name the
 * message with a `clientId`, which comes back on its own copy of the
 * broadcast so it can match the copy it is showing; sending the same
 * `clientId` again stores and sends nothing new and answers with the first
 * message's id, so a resend after a lost answer cannot post twice.
 *
 * Delivery is decided per member: a message to everyone reaches every
 * member, and a whisper its two people alone (whisper.integration.test.ts).
 * A client that passes no acknowledgement is refused with `error`, as before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let gmId: string;
let playerId: string;
let campaignId: string;
let gmCookie: string;
let playerCookie: string;

type Answer = { ok: true; id: string } | { ok: false; error: string };
type Broadcast = { id: string; content: string; clientId?: string };

const messages = () => prisma.message.findMany({ where: { campaignId, type: { not: 'SYSTEM' } }, orderBy: { createdAt: 'asc' } });

beforeAll(async () => {
  const [gm, player] = await Promise.all(
    ['dm', 'player'].map((name) =>
      prisma.user.create({ data: { email: `chatack-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Chat ${name}` } })
    )
  );
  gmId = gm.id;
  playerId = player.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Chat ack ${runId}`, ownerId: gmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: gmId, campaignId, role: 'GM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  [gmCookie, playerCookie] = await Promise.all([server.loginAs(gmId), server.loginAs(playerId)]);
});

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { chatCooldownEnabled: false } });
});

afterAll(async () => {
  await server?.close();
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [gmId, playerId] } } });
  await prisma.$disconnect();
});

describe('chat.message with an acknowledgement', () => {
  it('answers with the stored id, and gives the clientId back on the sender\'s copy only', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const toPlayer = waitForEvent<Broadcast>(player, 'chat.message');
    const toGm = waitForEvent<Broadcast>(gm, 'chat.message');

    const answer: Answer = await player.timeout(3000).emitWithAck('chat.message', { content: ' Hello ', clientId: 'c-1' });

    const [stored] = await messages();
    expect(answer).toEqual({ ok: true, id: stored.id });
    expect(await toPlayer).toMatchObject({ id: stored.id, content: 'Hello', clientId: 'c-1' });
    const gmCopy = await toGm;
    expect(gmCopy).toMatchObject({ id: stored.id, content: 'Hello' });
    expect(gmCopy).not.toHaveProperty('clientId');
  });

  it.each([
    ['an empty message', { content: '   ' }, /content required/i],
    ['a message over 2000 characters', { content: 'x'.repeat(2001) }, /2000/],
    ['a clientId that is not a short id', { content: 'Hi', clientId: 'x'.repeat(65) }, /clientId/],
    ['a clientId that is not text', { content: 'Hi', clientId: { id: 1 } }, /clientId/],
  ])('refuses %s through the acknowledgement alone', async (_what, payload, reason) => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const noError = expectNoEvent(player, 'error');

    const answer: Answer = await player.timeout(3000).emitWithAck('chat.message', payload);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(reason);
    await noError;
    expect(await messages()).toHaveLength(0);
  });

  it('refuses a message inside the campaign\'s cooldown through the acknowledgement', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { chatCooldownEnabled: true, chatCooldownSeconds: 30 } });
    const player = await server.connectAndAuth(playerCookie, campaignId);
    expect(await player.timeout(3000).emitWithAck('chat.message', { content: 'First' })).toMatchObject({ ok: true });

    const answer: Answer = await player.timeout(3000).emitWithAck('chat.message', { content: 'Second' });

    expect(answer).toEqual({ ok: false, error: 'Rate limit: wait 30s between messages.' });
    expect(await messages()).toHaveLength(1);
  });

  it('stores and sends a resent clientId once, answering with the first id', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const first: Answer = await player.timeout(3000).emitWithAck('chat.message', { content: 'Only once', clientId: 'c-2' });
    await waitForEvent(gm, 'chat.message');
    const noSecondCopy = expectNoEvent(gm, 'chat.message');

    const again: Answer = await player.timeout(3000).emitWithAck('chat.message', { content: 'Only once', clientId: 'c-2' });

    expect(again).toEqual(first);
    await noSecondCopy;
    expect(await messages()).toHaveLength(1);
  });

  it('keeps one member\'s clientId apart from another\'s', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const gm = await server.connectAndAuth(gmCookie, campaignId);

    const fromPlayer: Answer = await player.timeout(3000).emitWithAck('chat.message', { content: 'Mine', clientId: 'same' });
    const fromGm: Answer = await gm.timeout(3000).emitWithAck('chat.message', { content: 'Yours', clientId: 'same' });

    expect(fromPlayer.ok && fromGm.ok && fromPlayer.id !== fromGm.id).toBe(true);
    expect((await messages()).map((m) => m.content)).toEqual(['Mine', 'Yours']);
  });
});

describe('chat.message without an acknowledgement', () => {
  it('still refuses with an error event', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(player, 'error');

    player.emit('chat.message', { content: '' });

    expect((await refused).message).toMatch(/content required/i);
  });

  it('still delivers to everyone', async () => {
    const player = await server.connectAndAuth(playerCookie, campaignId);
    const gm = await server.connectAndAuth(gmCookie, campaignId);
    const toGm = waitForEvent<Broadcast>(gm, 'chat.message');

    player.emit('chat.message', { content: 'Plain' });

    expect(await toGm).toMatchObject({ content: 'Plain' });
  });
});
