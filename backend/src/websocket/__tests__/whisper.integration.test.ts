/**
 * A whisper: a chat message to one member, sent to its two people alone.
 *
 * `chat.message` with a `recipientId` is stored as a WHISPER naming them and
 * sent to the sender's sockets and the recipient's sockets in this campaign,
 * the `clientId` on the sender's copies only. Nobody else is sent it, the DM
 * included unless they are one of the two, and neither is the recipient's
 * connection to another campaign: their user room spans every campaign they
 * have open. Whoever may chat may whisper, spectators too, to any current
 * member but themselves; a whisper to anyone else is refused and nothing is
 * stored, also when the recipient was removed a moment before or their
 * account deleted while it was being written.
 *
 * "Nobody else" is checked without waiting out a window: after the whisper, a
 * message to everyone follows, and it has to be the first message the others
 * are sent. One connection is sent its messages in order, so a whisper that
 * reached them would have come first.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import { randomUUID } from 'crypto';
import type { Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../config/database';
import { clearCampaignFromLiveSockets } from '../utils';
import { WHISPER_RECIPIENT_REFUSAL, WHISPER_SELF_REFUSAL } from '../../services/permissions';
import { createWsTestServer, waitForEvent, WsTestServer } from '../../__tests__/helpers/websocket-test-server';

jest.setTimeout(20000);

const runId = randomUUID().slice(0, 8);

type Answer = { ok: true; id: string } | { ok: false; error: string };
interface Received {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: string;
  timestamp: string;
  recipientId?: string;
  recipientName?: string;
  clientId?: string;
}

const NAMES = { dm: 'Dana', ash: 'Ash', mara: 'Mara', cole: 'Cole', sky: 'Sky', out: 'Otto', finn: 'Finn', gail: 'Gail', hal: 'Hal' } as const;
type Person = keyof typeof NAMES;

let server: WsTestServer;
let campaignId: string;
let otherCampaignId: string;
const ids = {} as Record<Person, string>;
const cookies = {} as Record<Person, string>;

const stored = () => prisma.message.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
const connect = (who: Person, campaign = campaignId) => server.connectAndAuth(cookies[who], campaign);
const nextMessage = (client: ClientSocket) => waitForEvent<Received>(client, 'chat.message');

function send(client: ClientSocket, payload: Record<string, unknown>): Promise<Answer> {
  return client.timeout(3000).emitWithAck('chat.message', payload);
}

function whisper(client: ClientSocket, to: string, content: string, clientId?: string): Promise<Answer> {
  return send(client, { content, recipientId: to, ...(clientId ? { clientId } : {}) });
}

beforeAll(async () => {
  for (const who of Object.keys(NAMES) as Person[]) {
    const user = await prisma.user.create({
      data: { email: `whisper-${who}-${runId}@test.cozyvtt.local`, passwordHash: 'not-used-by-socket-auth', displayName: NAMES[who] },
    });
    ids[who] = user.id;
  }
  campaignId = (await prisma.campaign.create({ data: { name: `Whispers ${runId}`, ownerId: ids.dm, vibeSettings: {} } })).id;
  otherCampaignId = (await prisma.campaign.create({ data: { name: `Elsewhere ${runId}`, ownerId: ids.out, vibeSettings: {} } })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { userId: ids.dm, campaignId, role: 'DM', characterIds: [] },
      { userId: ids.ash, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.mara, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.cole, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.sky, campaignId, role: 'SPECTATOR', characterIds: [] },
      { userId: ids.finn, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.gail, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.hal, campaignId, role: 'PLAYER', characterIds: [] },
      { userId: ids.out, campaignId: otherCampaignId, role: 'DM', characterIds: [] },
      { userId: ids.mara, campaignId: otherCampaignId, role: 'PLAYER', characterIds: [] },
    ],
  });
  server = await createWsTestServer();
  for (const who of Object.keys(NAMES) as Person[]) cookies[who] = await server.loginAs(ids[who]);
});

beforeEach(async () => {
  await prisma.message.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { chatCooldownEnabled: false } });
});

afterAll(async () => {
  await server?.close();
  await prisma.message.deleteMany({ where: { campaignId: { in: [campaignId, otherCampaignId] } } });
  await prisma.campaign.deleteMany({ where: { id: { in: [campaignId, otherCampaignId] } } });
  await prisma.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.$disconnect();
});

describe('a whisper', () => {
  it('is stored as a whisper to its recipient, and sent to the sender and the recipient alone', async () => {
    const ash = await connect('ash');
    const mara = await connect('mara');
    const cole = await connect('cole');
    const dm = await connect('dm');
    const toAsh = nextMessage(ash);
    const toMara = nextMessage(mara);
    const toCole = nextMessage(cole);
    const toDm = nextMessage(dm);

    const answer = await whisper(ash, ids.mara, ' Meet me by the well ', 'w-1');

    const [row] = await stored();
    expect(answer).toEqual({ ok: true, id: row.id });
    expect(row).toMatchObject({ type: 'WHISPER', userId: ids.ash, recipientId: ids.mara, content: 'Meet me by the well' });
    const sent = { id: row.id, userId: ids.ash, userName: 'Ash', content: 'Meet me by the well', type: 'WHISPER', recipientId: ids.mara, recipientName: 'Mara', timestamp: row.createdAt.toISOString() };
    expect(await toAsh).toEqual({ ...sent, clientId: 'w-1' });
    expect(await toMara).toEqual(sent);

    expect(await send(ash, { content: 'Hello, all' })).toMatchObject({ ok: true });
    expect((await toCole).content).toBe('Hello, all');
    expect((await toDm).content).toBe('Hello, all');
  });

  it('reaches the sender\'s other tab, with the clientId', async () => {
    const ash = await connect('ash');
    const ashTab = await connect('ash');
    await connect('mara');
    const toTab = nextMessage(ashTab);

    await whisper(ash, ids.mara, 'From my first tab', 'w-2');

    expect(await toTab).toMatchObject({ content: 'From my first tab', type: 'WHISPER', recipientId: ids.mara, clientId: 'w-2' });
  });

  it('does not reach the recipient\'s connection to another campaign', async () => {
    const ash = await connect('ash');
    const maraHere = await connect('mara');
    const maraElsewhere = await connect('mara', otherCampaignId);
    const here = nextMessage(maraHere);
    const elsewhere = nextMessage(maraElsewhere);

    await whisper(ash, ids.mara, 'Only at this table');
    expect((await here).content).toBe('Only at this table');

    expect(await send(maraElsewhere, { content: 'Over here' })).toMatchObject({ ok: true });
    expect((await elsewhere).content).toBe('Over here');
  });

  it('from the DM is a whisper, whatever type they ask for, and the other players are not sent it', async () => {
    const dm = await connect('dm');
    const ash = await connect('ash');
    const cole = await connect('cole');
    const toAsh = nextMessage(ash);
    const toCole = nextMessage(cole);

    expect(await send(dm, { content: 'Roll a save, quietly', type: 'DM', recipientId: ids.ash })).toMatchObject({ ok: true });

    expect(await toAsh).toMatchObject({ type: 'WHISPER', userId: ids.dm, recipientId: ids.ash, recipientName: 'Ash' });
    expect(await send(dm, { content: 'Everyone, roll initiative' })).toMatchObject({ ok: true });
    expect((await toCole).content).toBe('Everyone, roll initiative');
  });

  it('may be sent by a spectator, and to one', async () => {
    const sky = await connect('sky');
    const mara = await connect('mara');
    const toMara = nextMessage(mara);
    const toSky = nextMessage(sky);

    expect(await whisper(sky, ids.mara, 'Watching closely')).toMatchObject({ ok: true });
    expect(await toMara).toMatchObject({ content: 'Watching closely', userId: ids.sky, type: 'WHISPER' });
    expect((await toSky).content).toBe('Watching closely');

    const backToSky = nextMessage(sky);
    expect(await whisper(mara, ids.sky, 'Thanks')).toMatchObject({ ok: true });
    expect(await backToSky).toMatchObject({ content: 'Thanks', userId: ids.mara, recipientId: ids.sky });
  });

  it('counts against the campaign\'s chat cooldown like any message', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { chatCooldownEnabled: true, chatCooldownSeconds: 30 } });
    const ash = await connect('ash');
    expect(await send(ash, { content: 'First' })).toMatchObject({ ok: true });

    expect(await whisper(ash, ids.mara, 'Second')).toEqual({ ok: false, error: 'Rate limit: wait 30s between messages.' });
    expect(await stored()).toHaveLength(1);
  });
});

describe('a whisper that is refused, and not stored', () => {
  it('to oneself', async () => {
    const ash = await connect('ash');
    expect(await whisper(ash, ids.ash, 'Note to self')).toEqual({ ok: false, error: WHISPER_SELF_REFUSAL });
    expect(await stored()).toHaveLength(0);
  });

  it.each([
    ['someone who is not in the campaign', () => ids.out],
    ['an id that names nobody', () => randomUUID()],
    ['an id that is not one', () => 'mara'],
  ])('to %s', async (_who, to) => {
    const ash = await connect('ash');
    expect(await whisper(ash, to(), 'Hello?')).toEqual({ ok: false, error: WHISPER_RECIPIENT_REFUSAL });
    expect(await stored()).toHaveLength(0);
  });

  it('to a member removed a moment before', async () => {
    const ash = await connect('ash');
    await connect('finn');
    await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: ids.finn, campaignId } } });
    await clearCampaignFromLiveSockets(ids.finn, campaignId);

    expect(await whisper(ash, ids.finn, 'Are you still there?')).toEqual({ ok: false, error: WHISPER_RECIPIENT_REFUSAL });
    expect(await stored()).toHaveLength(0);
  });

  it('to a member whose account is deleted while it is being written', async () => {
    const ash = await connect('ash');
    const findUnique = prisma.campaignMembership.findUnique.bind(prisma.campaignMembership);
    const read = jest.spyOn(prisma.campaignMembership, 'findUnique').mockImplementationOnce(((args: never) =>
      findUnique(args).then(async (found) => {
        await prisma.user.delete({ where: { id: ids.hal } });
        return found;
      })) as never);

    const answer = await whisper(ash, ids.hal, 'Just in time');
    read.mockRestore();

    expect(answer).toEqual({ ok: false, error: WHISPER_RECIPIENT_REFUSAL });
    expect(await stored()).toHaveLength(0);
  });

  it('as a failure to send, not a missing recipient, when the campaign is deleted while it is being written', async () => {
    const doomedId = (await prisma.campaign.create({ data: { name: `Doomed ${runId}`, ownerId: ids.dm, vibeSettings: {} } })).id;
    await prisma.campaignMembership.createMany({
      data: [
        { userId: ids.ash, campaignId: doomedId, role: 'PLAYER', characterIds: [] },
        { userId: ids.mara, campaignId: doomedId, role: 'PLAYER', characterIds: [] },
      ],
    });
    const ash = await connect('ash', doomedId);
    const findUnique = prisma.campaignMembership.findUnique.bind(prisma.campaignMembership);
    const read = jest.spyOn(prisma.campaignMembership, 'findUnique').mockImplementationOnce(((args: never) =>
      findUnique(args).then(async (found) => {
        await prisma.campaign.delete({ where: { id: doomedId } });
        return found;
      })) as never);

    const answer = await whisper(ash, ids.mara, 'Last words');
    read.mockRestore();

    expect(answer).toEqual({ ok: false, error: 'Failed to send chat message' });
    expect(await prisma.message.count({ where: { campaignId: doomedId } })).toBe(0);
  });

  it('without spending the sender\'s cooldown', async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { chatCooldownEnabled: true, chatCooldownSeconds: 30 } });
    const cole = await connect('cole');

    expect(await whisper(cole, ids.cole, 'Oops')).toEqual({ ok: false, error: WHISPER_SELF_REFUSAL });
    expect(await send(cole, { content: 'To everyone' })).toMatchObject({ ok: true });
  });
});

it('answers a resent whisper with the first id after its recipient has left, since it reached them', async () => {
  const ash = await connect('ash');
  const first = await whisper(ash, ids.gail, 'Before you go', 'w-3');
  expect(first.ok).toBe(true);
  await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: ids.gail, campaignId } } });

  expect(await whisper(ash, ids.gail, 'Before you go', 'w-3')).toEqual(first);
  expect(await stored()).toHaveLength(1);
});
