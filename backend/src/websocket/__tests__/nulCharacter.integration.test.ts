/**
 * A live-table event holding U+0000, the null character, is refused before
 * any handler reads it.
 *
 * PostgreSQL cannot store the character, so a chat message or a roll's
 * purpose holding it failed when it was written: the sender was told "Failed
 * to send chat message" and the server logged a database error. Every event
 * is now refused with one message, through its acknowledgement when it has
 * one and as `error` otherwise, as the handlers refuse anything else.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { createWsTestServer, waitForEvent, expectNoEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';
import { captureLogs } from '../../__tests__/helpers/logCapture';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);
const REFUSAL = 'Text cannot contain the null character (U+0000).';

let server: WsTestServer;
let gmId: string;
let campaignId: string;
let gmCookie: string;

const stored = () => prisma.message.findMany({ where: { campaignId, type: { not: 'SYSTEM' } } });

beforeAll(async () => {
  const gm = await prisma.user.create({
    data: { email: `nul-dm-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: 'Nul GM' },
  });
  gmId = gm.id;
  campaignId = (await prisma.campaign.create({ data: { name: `Nul ${runId}`, ownerId: gmId, vibeSettings: {}, status: 'ACTIVE' } })).id;
  await prisma.campaignMembership.create({ data: { userId: gmId, campaignId, role: 'GM', characterIds: [] } });
  server = await createWsTestServer();
  gmCookie = await server.loginAs(gmId);
});

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await server?.close();
  await prisma.message.deleteMany({ where: { campaignId } });
  await prisma.campaign.deleteMany({ where: { id: campaignId } });
  await prisma.user.deleteMany({ where: { id: gmId } });
  await prisma.$disconnect();
});

describe('an event holding U+0000', () => {
  it('is refused through its acknowledgement, stores nothing and logs no error', async () => {
    const client = await server.connectAndAuth(gmCookie, campaignId);
    const noError = expectNoEvent(client, 'error');
    const logs = captureLogs();

    const answer: unknown = await client.timeout(3000).emitWithAck('chat.message', { content: 'Hello\u0000there' });

    expect(answer).toEqual({ ok: false, error: REFUSAL });
    await noError;
    const entries = await logs.stop();
    expect(entries.filter((entry) => entry.level === 'error')).toEqual([]);
    expect(await stored()).toEqual([]);
    client.disconnect();
  });

  it('is refused with error when it has no acknowledgement, wherever in the payload it is', async () => {
    const client = await server.connectAndAuth(gmCookie, campaignId);
    const refused = waitForEvent<{ message: string }>(client, 'error');

    client.emit('dice.roll', { expression: '1d20', purpose: 'Stealth\u0000' });

    expect(await refused).toEqual({ message: REFUSAL });
    expect(await stored()).toEqual([]);
    client.disconnect();
  });

  it('tells a flood without acknowledgements once in ten seconds, and answers every acknowledgement', async () => {
    const client = await server.connectAndAuth(gmCookie, campaignId);
    const errors: unknown[] = [];
    client.on('error', (data: unknown) => errors.push(data));

    for (let i = 0; i < 5; i++) client.emit('dice.roll', { expression: '1d20', purpose: `Stealth\u0000${i}` });
    const answers = await Promise.all(
      [1, 2, 3].map((): Promise<unknown> => client.timeout(3000).emitWithAck('chat.message', { content: 'Hello\u0000' }))
    );
    const pong = waitForEvent(client, 'pong');
    client.emit('ping');
    await pong;

    expect(errors).toEqual([{ message: REFUSAL }]);
    expect(answers).toEqual([1, 2, 3].map(() => ({ ok: false, error: REFUSAL })));
    client.disconnect();
  });

  it('leaves an event without one alone', async () => {
    const client = await server.connectAndAuth(gmCookie, campaignId);

    const answer: unknown = await client.timeout(3000).emitWithAck('chat.message', { content: 'Written as \\u0000' });

    expect(answer).toMatchObject({ ok: true });
    expect((await stored()).map((m) => m.content)).toEqual(['Written as \\u0000']);
    client.disconnect();
  });
});
