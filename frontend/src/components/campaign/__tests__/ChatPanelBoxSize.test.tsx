/**
 * The chat keeps its newest message in view when its box changes size.
 *
 * The log keeps its scroll position as its box grows or shrinks, so a reader
 * at the newest message lost it below the box whenever the box got shorter:
 * the compact layout's Chat sheet made half height again, the table moved
 * from the desktop's rail into that sheet as a tablet turned, a window made
 * shorter. A reader at the newest message stays there; one who has scrolled
 * up stays where they are.
 */

import { it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { MessageHistoryPage } from '@/types';

vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [], chatCooldownEnabled: false } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
const socket = { onChatMessage: vi.fn(), onChatSystem: vi.fn(), off: vi.fn(), sendChatMessage: vi.fn() };
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket, joinedEpoch: 1 }) }));
const empty: MessageHistoryPage = { messages: [], pagination: { limit: 50, hasMore: false, nextCursor: null } };
vi.mock('@/services/message.service', () => ({ getMessages: async () => empty }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import ChatPanel from '../ChatPanel';

/** Every ResizeObserver the panel makes, with what it observes. */
const observers: Array<{ report: () => void; targets: Element[] }> = [];

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true, writable: true });
});

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', class {
    private readonly entry: { report: () => void; targets: Element[] };
    constructor(callback: ResizeObserverCallback) {
      this.entry = { report: () => callback([], this as unknown as ResizeObserver), targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.push(target); }
    unobserve() {}
    disconnect() { this.entry.targets = []; }
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openLog() {
  render(<ChatPanel />);
  await screen.findByRole('textbox', { name: 'Chat message' });
  const log = screen.getByRole('log', { name: 'Chat messages' });
  Object.defineProperty(log, 'scrollHeight', { value: 2_000, configurable: true });
  Object.defineProperty(log, 'clientHeight', { value: 500, configurable: true });
  return log;
}

/** The log's box changes size. */
const resize = (log: Element) => act(() => observers.filter((o) => o.targets.includes(log)).forEach((o) => o.report()));

it('keeps a reader at the newest message there as the box gets shorter', async () => {
  const log = await openLog();
  log.scrollTop = 1_500;
  fireEvent.scroll(log);
  const scrollTo = vi.spyOn(log, 'scrollTo');

  resize(log);

  expect(scrollTo).toHaveBeenCalledWith({ top: 2_000, behavior: 'auto' });
});

it('leaves a reader who has scrolled up where they are', async () => {
  const log = await openLog();
  log.scrollTop = 200;
  fireEvent.scroll(log);
  const scrollTo = vi.spyOn(log, 'scrollTo');

  resize(log);

  expect(scrollTo).not.toHaveBeenCalled();
});
