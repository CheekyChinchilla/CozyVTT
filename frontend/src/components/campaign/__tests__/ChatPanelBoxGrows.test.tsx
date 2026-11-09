/**
 * The chat box grows with what is typed: up to 4 lines in the compact
 * layout's Chat sheet and 6 on a computer, then it scrolls; sending shrinks
 * it back to one line.
 */

import { it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { MessageHistoryPage } from '@/types';

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@/contexts/LayoutContext', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCompactLayout: () => layout.compact,
}));
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

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true, writable: true });
  // jsdom lays nothing out: a box's content is as tall as its lines, 20 px each.
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return Math.max(1, this.value.split('\n').length) * 20;
    },
  });
});

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // The server's answer to a sent message, as the panel reads it.
  socket.sendChatMessage.mockReset().mockResolvedValue({ ok: true, id: 'message-1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function chatBox() {
  render(<ChatPanel />);
  return screen.findByRole('textbox', { name: 'Chat message' });
}

const heightOf = (el: HTMLElement) => parseFloat(el.style.height);

it('grows to three lines for three lines typed on a computer, and to six at most', async () => {
  layout.compact = false;
  const box = await chatBox();
  fireEvent.change(box, { target: { value: 'one\ntwo\nthree' } });
  expect(heightOf(box)).toBe(60);
  fireEvent.change(box, { target: { value: '1\n2\n3\n4\n5\n6\n7\n8' } });
  expect(heightOf(box)).toBe(120);
  expect(box.style.overflowY).toBe('auto');
});

it('grows to four lines at most in the compact layout', async () => {
  layout.compact = true;
  const box = await chatBox();
  fireEvent.change(box, { target: { value: '1\n2\n3\n4\n5\n6' } });
  expect(heightOf(box)).toBe(80);
});

it('shrinks back to one line when Enter sends the message', async () => {
  layout.compact = true;
  const box = await chatBox();
  fireEvent.change(box, { target: { value: 'one\ntwo\nthree' } });
  expect(heightOf(box)).toBe(60);

  await act(async () => { fireEvent.keyDown(box, { key: 'Enter' }); });

  expect(socket.sendChatMessage).toHaveBeenCalled();
  expect(heightOf(box)).toBe(20);
});

// The placeholder gave the keys the line under the box gives already.
it('says the keys once on a computer: under the box, and not in its placeholder', async () => {
  layout.compact = false;
  const box = await chatBox();
  expect(box).toHaveAttribute('placeholder', 'Type a message…');
  expect(screen.getByText('Press Enter to send, Shift+Enter for new line')).toBeTruthy();
});
