/**
 * The chat holds the newest 400 messages, and Load More brings back the rest.
 *
 * The panel kept every message of a session in memory and on screen, so a
 * long session made the page heavier and heavier, on a phone and on the
 * desktop alike. It now holds the newest MAX_HELD_MESSAGES: while the reader
 * is at the newest message, the oldest leave as new ones arrive, and Load More
 * brings them back from the server in order, none twice, then older ones. A
 * reader scrolled up, or reading what Load More brought back, keeps it until
 * they are back at the newest, up to twice as many messages: a chat left
 * scrolled up does not grow without end. A message that has not been sent
 * never leaves.
 *
 * The server here pages as the real one does, newest first by time and id
 * from an opaque cursor, so the panel can only reach a message it let go of
 * through cursors the server gave it.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MessageType } from '@/types';
import type { ChatMessageAck, ChatMessageBroadcast, ChatMessageEvent, Message, MessageHistoryPage } from '@/types';

const ws = { joinedEpoch: 1 };
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [], chatCooldownEnabled: false } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));

let onMessage: ((data: ChatMessageBroadcast) => void) | null = null;
const sendChatMessage = vi.fn<(data: ChatMessageEvent) => Promise<ChatMessageAck>>();
const socket = {
  onChatMessage: (fn: (data: ChatMessageBroadcast) => void) => { onMessage = fn; },
  onChatSystem: vi.fn(),
  off: vi.fn(),
  sendChatMessage: (data: ChatMessageEvent) => sendChatMessage(data),
};
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket, joinedEpoch: ws.joinedEpoch }) }));
const getMessages = vi.fn<(campaignId: string, limit: number, cursor?: string) => Promise<MessageHistoryPage>>();
vi.mock('@/services/message.service', () => ({ getMessages: (campaignId: string, limit: number, cursor?: string) => getMessages(campaignId, limit, cursor) }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import ChatPanel, { MAX_HELD_MESSAGES } from '../ChatPanel';

// ============================================
// The server
// ============================================

/** The campaign's chat as the server holds it. */
let stored: Message[] = [];
let clock = 0;

/** The server's order: by time, then by id. */
const byTime = (a: Message, b: Message) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const cursorAfter = (m: Message) => `cursor:${m.id}`;

/** A page of history, newest first, from where `cursor` says the last one stopped. */
function readPage(limit: number, cursor?: string): MessageHistoryPage {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error(`Limit must be between 1 and 100 (asked for ${limit})`);
  let older = [...stored].sort(byTime).reverse();
  if (cursor !== undefined) {
    const at = stored.find((m) => cursorAfter(m) === cursor);
    if (!at) throw new Error('Invalid cursor');
    older = older.filter((m) => byTime(m, at) < 0);
  }
  const messages = older.slice(0, limit);
  const hasMore = older.length > limit;
  return { messages, pagination: { limit, hasMore, nextCursor: hasMore ? cursorAfter(messages[messages.length - 1]) : null } };
}

/** Message `name`, sent a second after the one before it. */
const said = (name: string): Message => ({
  id: name.toLowerCase().replace(/(\d+)$/, (n) => n.padStart(4, '0')).replace(' ', '-'),
  campaignId: 'campaign-1', userId: 'them', user: { id: 'them', displayName: 'Them' },
  type: MessageType.PLAYER, content: name, metadata: null,
  createdAt: new Date(Date.UTC(2026, 9, 28, 18, 0, ++clock)).toISOString(),
});
const range = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix} ${from + i}`);

/** Messages sent to the table: stored, then sent live. */
function arrive(names: string[]) {
  act(() => {
    for (const name of names) {
      const m = said(name);
      stored.push(m);
      onMessage!({ id: m.id, userId: 'them', userName: 'Them', content: m.content, type: m.type, timestamp: m.createdAt });
    }
  });
}

// ============================================
// The panel
// ============================================

/** The messages on screen, top to bottom. */
const shown = () => screen.queryAllByText(/^(Old|Live|New) \d+$/).map((el) => el.textContent);
const loadMore = () => screen.queryByRole('button', { name: 'Load More' });

async function pressLoadMore() {
  const before = shown().length;
  await act(async () => { fireEvent.click(loadMore()!); });
  await waitFor(() => expect(shown().length).toBeGreaterThan(before));
}

/** Where the reader has the log: at the newest message, or scrolled up. */
function scrollLog(to: 'top' | 'bottom') {
  const log = screen.getByRole('log', { name: 'Chat messages' });
  Object.defineProperty(log, 'scrollHeight', { value: 10_000, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 500, configurable: true });
  log.scrollTop = to === 'top' ? 0 : 9_500;
  fireEvent.scroll(log);
}

async function openPanel() {
  render(<ChatPanel />);
  await screen.findByRole('textbox', { name: 'Chat message' });
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  // The panel logs every message it receives; hundreds arrive here.
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  ws.joinedEpoch = 1;
  stored = [];
  clock = 0;
  onMessage = null;
  sendChatMessage.mockReset();
  getMessages.mockReset().mockImplementation(async (_campaignId, limit, cursor) => readPage(limit, cursor));
});

it('holds 400 messages', () => {
  expect(MAX_HELD_MESSAGES).toBe(400);
});

it('lets the oldest go as new ones arrive, and Load More brings them back, then older ones, none twice', async () => {
  stored = range('Old', 1, 120).map(said);
  await openPanel();
  expect(shown()).toEqual(range('Old', 71, 120));

  arrive(range('Live', 1, 400));
  expect(shown()).toEqual(range('Live', 1, 400));
  // The header counts what is shown, which is not all the chat holds.
  expect(screen.getByText('400 shown')).toBeTruthy();

  // Exactly the 50 that left, back above the rest.
  await pressLoadMore();
  expect(shown()).toEqual([...range('Old', 71, 120), ...range('Live', 1, 400)]);

  // Reading them, the reader is scrolled up: a new message leaves them be.
  scrollLog('top');
  arrive(['Live 401']);
  expect(shown()).toEqual([...range('Old', 71, 120), ...range('Live', 1, 401)]);
  expect(screen.getByRole('button', { name: 'Jump to newest' })).toBeTruthy();

  await pressLoadMore();
  expect(shown()[0]).toBe('Old 21');
  await pressLoadMore();
  expect(shown()).toEqual([...range('Old', 1, 120), ...range('Live', 1, 401)]);
  expect(loadMore()).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('lets go once the reader is back at the newest, and Load More then reaches back from there', async () => {
  await openPanel();
  arrive(range('Live', 1, 400));
  expect(loadMore()).toBeNull();

  scrollLog('top');
  arrive(range('Live', 401, 420));
  expect(shown()).toHaveLength(420);

  scrollLog('bottom');
  arrive(['Live 421']);
  expect(shown()).toEqual(range('Live', 22, 421));

  await pressLoadMore();
  expect(shown()).toEqual(range('Live', 1, 421));
  expect(loadMore()).toBeNull();
});

it('holds at most twice as many while the reader stays scrolled up', async () => {
  await openPanel();
  arrive(range('Live', 1, 400));
  scrollLog('top');
  arrive(range('Live', 401, 900));
  expect(shown()).toEqual(range('Live', 101, 900));

  scrollLog('bottom');
  arrive(['Live 901']);
  expect(shown()).toEqual(range('Live', 502, 901));
});

it('never lets go of a message that was not sent', async () => {
  sendChatMessage.mockResolvedValue({ ok: false, error: 'Not connected' });
  await openPanel();
  fireEvent.change(screen.getByRole('textbox', { name: 'Chat message' }), { target: { value: 'Mine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await screen.findByText(/Not sent: Not connected/);

  arrive(range('Live', 1, 400));
  expect(screen.getByText('Mine')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(shown()).toEqual(range('Live', 2, 400));
});

it('holds 400 after a rejoin that read back more, and Load More brings back the rest', async () => {
  stored = range('Old', 1, 30).map(said);
  const view = render(<ChatPanel />);
  await screen.findByText('Old 30');
  expect(loadMore()).toBeNull();

  // While away, 450 messages were sent.
  stored.push(...range('New', 1, 450).map(said));
  ws.joinedEpoch = 2;
  await act(async () => { view.rerender(<ChatPanel />); });
  await waitFor(() => expect(screen.getByText('New 450')).toBeTruthy());

  expect(shown()).toEqual(range('New', 51, 450));
  await pressLoadMore();
  expect(shown()).toEqual(range('New', 1, 450));
  await pressLoadMore();
  expect(shown()).toEqual([...range('Old', 1, 30), ...range('New', 1, 450)]);
  expect(loadMore()).toBeNull();
});

// ============================================
// A Load More whose list changed under it
// ============================================

/**
 * Reads held back while `hold.on`, each until its own release, in the order
 * they were asked for: so a Load More's answer can land in the same render
 * as another change to the list, as it can in the browser.
 */
function holdReads() {
  const hold = { on: true, waiting: [] as (() => void)[] };
  getMessages.mockImplementation(async (_campaignId, limit, cursor) => {
    if (hold.on) await new Promise<void>((resolve) => hold.waiting.push(resolve));
    return readPage(limit, cursor);
  });
  return hold;
}

/** Lets promise callbacks run without a render, as one browser task does. */
async function settle() {
  for (let i = 0; i < 200; i++) await Promise.resolve();
}

it('drops a page that lands as its oldest message leaves, and Load More reads on from the list as it is', async () => {
  stored = range('Old', 1, 100).map(said);
  await openPanel();
  arrive(range('Live', 1, 400));
  scrollLog('top');

  // Load More finds where the history before Live 1 begins; its last read waits.
  const hold = holdReads();
  await act(async () => { fireEvent.click(loadMore()!); });
  while (hold.waiting.length === 0 || getMessages.mock.lastCall?.[1] !== 50) {
    await act(async () => { hold.waiting.shift()?.(); await settle(); });
  }

  // Back at the newest, a message arrives, letting Live 1 go, and the page
  // ending just above Live 1 lands before anything is drawn.
  scrollLog('bottom');
  const log = screen.getByRole('log', { name: 'Chat messages' });
  const scrolledTo = vi.fn();
  Object.defineProperty(log, 'scrollTop', { configurable: true, get: () => 9_500, set: scrolledTo });
  hold.on = false;
  await act(async () => {
    const m = said('Live 401');
    stored.push(m);
    onMessage!({ id: m.id, userId: 'them', userName: 'Them', content: m.content, type: m.type, timestamp: m.createdAt });
    hold.waiting.shift()!();
    await settle();
  });
  expect(shown()).toEqual(range('Live', 2, 401));
  // The reader's place is kept for a page the list took, and no other.
  arrive(['Live 402']);
  expect(scrolledTo).not.toHaveBeenCalled();

  scrollLog('top');
  await pressLoadMore();
  expect(shown()).toEqual([...range('Old', 53, 100), ...range('Live', 1, 402)]);
});

it('drops a page that lands as a rejoin starts the list again', async () => {
  stored = range('Old', 1, 100).map(said);
  const view = render(<ChatPanel />);
  await screen.findByText('Old 100');
  scrollLog('top');

  const hold = holdReads();
  await act(async () => { fireEvent.click(loadMore()!); });

  // While away, 600 were sent: too many to join up, so the list starts again.
  stored.push(...range('New', 1, 600).map(said));
  ws.joinedEpoch = 2;
  await act(async () => { view.rerender(<ChatPanel />); });
  expect(hold.waiting).toHaveLength(2);

  await act(async () => {
    hold.on = false;
    hold.waiting[1]();
    await settle();
    hold.waiting[0]();
    await settle();
  });
  expect(shown()).toEqual(range('New', 101, 600));

  await pressLoadMore();
  expect(shown()).toEqual(range('New', 51, 600));
});

// This one draws over 1,300 messages, which takes about 3.5 s with coverage
// here and about 2.7 times as long on CI's runner, past the default 5 s.
it('keeps what a reader scrolled up brought back while people chat, until they are back at the newest', async () => {
  stored = range('Old', 1, 1000).map(said);
  await openPanel();
  scrollLog('top');
  for (let i = 0; i < 16; i++) await pressLoadMore();
  expect(shown()[0]).toBe('Old 151');
  expect(shown()).toHaveLength(850);

  arrive(['Live 1']);
  expect(shown()).toHaveLength(851);
  expect(shown()[0]).toBe('Old 151');

  // Further back, with the cursor it holds: one read.
  getMessages.mockClear();
  await pressLoadMore();
  expect(getMessages).toHaveBeenCalledTimes(1);
  expect(shown()[0]).toBe('Old 101');

  // 400 more may arrive before what the reader brought back starts to leave.
  arrive(range('Live', 2, 401));
  expect(shown()[0]).toBe('Old 101');
  arrive(['Live 402']);
  expect(shown()[0]).toBe('Old 102');

  // Back at the newest the chat holds 400, and scrolled up again, 800.
  scrollLog('bottom');
  arrive(['Live 403']);
  expect(shown()).toEqual(range('Live', 4, 403));
  scrollLog('top');
  arrive(range('Live', 404, 804));
  expect(shown()).toEqual(range('Live', 5, 804));
}, 30_000);
