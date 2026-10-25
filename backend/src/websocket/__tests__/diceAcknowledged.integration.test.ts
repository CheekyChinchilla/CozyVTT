/**
 * A dice roll, and clearing the dice history, can be answered.
 *
 * Both were sent and forgotten, with refusals as general `error` events: the
 * dice panel took every `error` on the socket as a refused roll, so a chat or
 * token refusal showed in its banner, and a roll made from a sheet, a roll
 * picker or the map's menu that was refused said nothing where it was made.
 * A client that passes an acknowledgement now gets `{ ok: true, id }` for a
 * roll (the stored roll's id), `{ ok: true }` for a clear, or
 * `{ ok: false, error }`, and no `error` event. Without one, refusals are
 * `error` events as before.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

let server: WsTestServer;
let dmId: string;
let playerId: string;
let watcherId: string;
let floodId: string;
let campaignId: string;
const cookies: Record<string, string> = {};

type Answer = { ok: true; id?: string } | { ok: false; error: string };

beforeAll(async () => {
  const users = await Promise.all(
    ['dm', 'player', 'watcher', 'flood'].map((name) =>
      prisma.user.create({ data: { email: `diceack-${name}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: `Dice ${name}` } })
    )
  );
  [dmId, playerId, watcherId, floodId] = users.map((u) => u.id);
  campaignId = (await prisma.campaign.create({ data: { name: `Dice ack ${runId}`, ownerId: dmId, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: dmId, campaignId, role: 'DM', characterIds: [] },
      { userId: playerId, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: watcherId, campaignId, role: 'SPECTATOR', characterIds: [] },
      { userId: floodId, campaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  for (const [name, id] of [['dm', dmId], ['player', playerId], ['watcher', watcherId], ['flood', floodId]] as const) {
    cookies[name] = await server.loginAs(id);
  }
});

afterAll(async () => {
  await server?.close();
  await prisma.diceRoll.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: { in: [dmId, playerId, watcherId, floodId] } } });
  await prisma.$disconnect();
});

describe('dice.roll with an acknowledgement', () => {
  it('answers with the stored roll\'s id, and the roll still reaches the table', async () => {
    const player = await server.connectAndAuth(cookies.player, campaignId);
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    const toDm = waitForEvent<{ id: string }>(dm, 'dice.rolled');

    const answer: Answer = await player.timeout(3000).emitWithAck('dice.roll', { expression: '1d20+2', purpose: 'Stealth' });

    const stored = await prisma.diceRoll.findFirstOrThrow({ where: { campaignId, userId: playerId }, orderBy: { rolledAt: 'desc' } });
    expect(answer).toEqual({ ok: true, id: stored.id });
    expect((await toDm).id).toBe(stored.id);
  });

  it.each([
    ['an expression the parser refuses', 'player', { expression: '1d20 +' }, /Invalid dice expression/],
    ['a purpose over 300 characters', 'player', { expression: '1d20', purpose: 'P'.repeat(301) }, /Purpose/],
    ['a spectator\'s roll', 'watcher', { expression: '1d20' }, /Spectators cannot roll dice/],
  ])('refuses %s through the acknowledgement alone', async (_what, who, payload, reason) => {
    const socket = await server.connectAndAuth(cookies[who], campaignId);
    const noError = expectNoEvent(socket, 'error');

    const answer: Answer = await socket.timeout(3000).emitWithAck('dice.roll', payload);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error).toMatch(reason);
    await noError;
  });

  it('answers every roll past the flood ceiling, with no error event', async () => {
    const flood = await server.connectAndAuth(cookies.flood, campaignId);
    const noError = expectNoEvent(flood, 'error', 1000);

    const answers: Answer[] = await Promise.all(
      Array.from({ length: 53 }, () => flood.timeout(5000).emitWithAck('dice.roll', { expression: '1d4' }))
    );

    const refused = answers.filter((a): a is { ok: false; error: string } => !a.ok);
    expect(refused.length).toBeGreaterThanOrEqual(3);
    expect(refused.every((a) => a.error.startsWith('Rate limit exceeded'))).toBe(true);
    await noError;
  });
});

describe('dice.clearHistory with an acknowledgement', () => {
  it('answers the DM', async () => {
    const dm = await server.connectAndAuth(cookies.dm, campaignId);
    expect(await dm.timeout(3000).emitWithAck('dice.clearHistory')).toEqual({ ok: true });
  });

  it('refuses a player through the acknowledgement alone', async () => {
    const player = await server.connectAndAuth(cookies.player, campaignId);
    const noError = expectNoEvent(player, 'error');

    expect(await player.timeout(3000).emitWithAck('dice.clearHistory')).toEqual({ ok: false, error: 'Only the DM can clear roll history' });
    await noError;
  });
});
