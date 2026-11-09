/**
 * GET /api/campaigns/:campaignId/messages, as each member reads it.
 *
 * A whisper is for the two people it is between. The history keeps every
 * type but dice rolls, so a type added later shows up in chat by default;
 * without a rule of its own a whisper would reach the whole table, the DM
 * included, on every load and every rejoin. The rule is the message's type
 * with its sender and recipient: a whisper is sent to whoever wrote it and
 * whoever it names, and to nobody else. A whisper whose recipient's account
 * was deleted has no recipient left and stays its sender's alone.
 *
 * The rule sits beside the cursor's own condition, and must not replace it
 * or be replaced by it, so a reader who pages back past a whisper between
 * two other people is checked on every page.
 *
 * Requires PostgreSQL at DATABASE_URL.
 */

import request from 'supertest';
import { createTestApp } from '../../__tests__/helpers/test-app';
import {
  prisma,
  createTestUser,
  createTestCampaign,
  cleanupUsers,
  cleanupCampaigns,
  TEST_PASSWORD,
} from '../../__tests__/helpers/db';

const app = createTestApp();

interface Row {
  id: string;
  content: string;
  type: string;
  userId: string | null;
  recipientId: string | null;
  recipientName: string | null;
  recipient: { id: string; displayName: string } | null;
}
interface Page {
  messages: Row[];
  pagination: { limit: number; hasMore: boolean; nextCursor: string | null };
}

type Agent = ReturnType<typeof request.agent>;

const stamp = Date.now();
const email = (name: string) => `hist_${name}_${stamp}@test.invalid`;
const at = (offsetMs: number) => new Date(Date.UTC(2026, 0, 1) + offsetMs);

let campaignId: string;
const ids: Record<'dm' | 'ash' | 'mara' | 'cole' | 'gone', string> = { dm: '', ash: '', mara: '', cole: '', gone: '' };
const agents: Partial<Record<'dm' | 'ash' | 'mara' | 'cole', Agent>> = {};

async function login(name: string): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: email(name), password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** Write a message straight to the table, at a set time so the order is fixed. */
async function seed(row: { from: string | null; to?: string | null; type: 'PLAYER' | 'DM' | 'WHISPER'; content: string; at: Date }) {
  await prisma.message.create({
    data: { campaignId, userId: row.from, recipientId: row.to ?? null, type: row.type, content: row.content, createdAt: row.at },
  });
}

/** Every message a member is sent, newest first, following the cursor to the end. */
async function readAll(agent: Agent, limit = 50): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  // Capped so a cursor that never ends fails instead of hanging.
  for (let page = 0; page < 20; page++) {
    const url = `/api/campaigns/${campaignId}/messages?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await agent.get(url);
    expect(res.status).toBe(200);
    const body = res.body as Page;
    seen.push(...body.messages.map((m) => m.content));
    if (!body.pagination.hasMore) return seen;
    cursor = body.pagination.nextCursor;
    expect(cursor).toBeTruthy();
  }
  throw new Error('the cursor never reached the first message');
}

beforeAll(async () => {
  const names = { dm: 'Dana', ash: 'Ash', mara: 'Mara', cole: 'Cole', gone: 'Gone' } as const;
  for (const key of Object.keys(names) as (keyof typeof names)[]) {
    ids[key] = (await createTestUser({ email: email(key), displayName: names[key], isApproved: true })).id;
  }
  campaignId = (await createTestCampaign(ids.dm, { name: `Whisper history ${stamp}` })).id;
  await prisma.campaignMembership.createMany({
    data: [
      { campaignId, userId: ids.dm, role: 'DM', characterIds: [] },
      { campaignId, userId: ids.ash, role: 'PLAYER', characterIds: [] },
      { campaignId, userId: ids.mara, role: 'PLAYER', characterIds: [] },
      { campaignId, userId: ids.cole, role: 'SPECTATOR', characterIds: [] },
      { campaignId, userId: ids.gone, role: 'PLAYER', characterIds: [] },
    ],
  });
  for (const key of ['dm', 'ash', 'mara', 'cole'] as const) agents[key] = await login(key);
});

afterEach(async () => {
  await prisma.message.deleteMany({ where: { campaignId } });
});

afterAll(async () => {
  await cleanupCampaigns([campaignId]);
  await cleanupUsers(Object.values(ids).filter(Boolean));
  await prisma.$disconnect();
});

describe('whispers in the chat history', () => {
  beforeEach(async () => {
    await seed({ from: ids.ash, type: 'PLAYER', content: 'public from Ash', at: at(0) });
    await seed({ from: ids.ash, to: ids.mara, type: 'WHISPER', content: 'Ash to Mara', at: at(1) });
    await seed({ from: ids.dm, to: ids.ash, type: 'WHISPER', content: 'Dana to Ash', at: at(2) });
    await seed({ from: ids.mara, to: ids.cole, type: 'WHISPER', content: 'Mara to Cole', at: at(3) });
    await seed({ from: ids.dm, type: 'DM', content: 'public from Dana', at: at(4) });
  });

  it.each([
    ['the sender of one and recipient of another', 'ash', ['public from Dana', 'Dana to Ash', 'Ash to Mara', 'public from Ash']],
    ['a recipient and sender', 'mara', ['public from Dana', 'Mara to Cole', 'Ash to Mara', 'public from Ash']],
    ['a spectator a whisper is for', 'cole', ['public from Dana', 'Mara to Cole', 'public from Ash']],
    ['the DM, who reads only their own', 'dm', ['public from Dana', 'Dana to Ash', 'public from Ash']],
  ] as const)('sends %s the whispers they are part of, and no others', async (_who, reader, expected) => {
    expect(await readAll(agents[reader]!)).toEqual(expected);
  });

  it('names the recipient of a whisper, and nobody on a message to everyone', async () => {
    const body = (await agents.ash!.get(`/api/campaigns/${campaignId}/messages`)).body as Page;
    const whisper = body.messages.find((m) => m.content === 'Ash to Mara');
    expect(whisper).toMatchObject({
      type: 'WHISPER',
      userId: ids.ash,
      recipientId: ids.mara,
      recipientName: 'Mara',
      recipient: { id: ids.mara, displayName: 'Mara' },
    });
    expect(body.messages.find((m) => m.content === 'public from Ash')).toMatchObject({ recipientId: null, recipientName: null, recipient: null });
  });
});

it('keeps a whisper out of every page a third member reads, and still reaches the first message once', async () => {
  // Ten messages to everyone, with a whisper between Ash and Mara among the
  // ones on the second page of four.
  for (let i = 0; i < 10; i++) await seed({ from: ids.ash, type: 'PLAYER', content: `public ${i}`, at: at(i * 10) });
  await seed({ from: ids.ash, to: ids.mara, type: 'WHISPER', content: 'secret on page two', at: at(35) });

  const seen = await readAll(agents.cole!, 4);

  expect(seen).not.toContain('secret on page two');
  expect(seen).toEqual(Array.from({ length: 10 }, (_, i) => `public ${9 - i}`));
  expect(await readAll(agents.mara!, 4)).toContain('secret on page two');
});

it('leaves a whisper to a deleted account to its sender alone, and one from a deleted account to its recipient', async () => {
  await seed({ from: ids.ash, to: ids.gone, type: 'WHISPER', content: 'to someone who left', at: at(0) });
  await seed({ from: ids.gone, to: ids.mara, type: 'WHISPER', content: 'from someone who left', at: at(1) });
  await prisma.user.delete({ where: { id: ids.gone } });
  ids.gone = '';

  const rows = await prisma.message.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
  expect(rows.map((r) => [r.userId, r.recipientId])).toEqual([[ids.ash, null], [null, ids.mara]]);

  expect(await readAll(agents.ash!)).toEqual(['to someone who left']);
  expect(await readAll(agents.mara!)).toEqual(['from someone who left']);
  expect(await readAll(agents.cole!)).toEqual([]);
  expect(await readAll(agents.dm!)).toEqual([]);
});
