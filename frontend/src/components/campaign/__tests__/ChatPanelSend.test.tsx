/**
 * A chat message waits for the server's answer, and says when it was not sent.
 *
 * Messages were sent and forgotten. One lost while the connection dropped,
 * or refused (the campaign's cooldown, a message too long), stayed
 * "sending…" for good. Now each one is answered: confirmed, or marked
 * **Not sent** with the reason, **Retry** and **Discard**. A retry names the
 * message as the first try did, so the server posts it once however many
 * times it is sent.
 *
 * Also: the sender's copy coming back is matched by that name, not by its
 * text, a message already shown is not added again, messages that arrive
 * before the history has loaded are kept, and the box takes at most the
 * 2000 characters the server accepts.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ChatMessageAck, ChatMessageBroadcast, ChatMessageEvent } from '@/types';

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
vi.mock('@/contexts/WebSocketContext', () => ({ useWebSocket: () => ({ socket, joinedEpoch: 1 }) }));
const getMessages = vi.fn();
vi.mock('@/services/message.service', () => ({ getMessages: (...a: unknown[]) => getMessages(...a) }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import ChatPanel from '../ChatPanel';

const emptyPage = { messages: [], pagination: { hasMore: false, nextCursor: null } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const broadcast = (fields: Partial<ChatMessageBroadcast>): ChatMessageBroadcast => ({
  id: 'm-1', userId: 'me', userName: 'Me', content: 'Hello', type: 'PLAYER' as ChatMessageBroadcast['type'], timestamp: new Date().toISOString(), ...fields,
});

async function openPanel() {
  render(<ChatPanel />);
  await screen.findByRole('textbox', { name: 'Chat message' });
}

function send(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Chat message' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  onMessage = null;
  sendChatMessage.mockReset();
  getMessages.mockReset();
  getMessages.mockResolvedValue(emptyPage);
});

it('shows a message as sending until the server confirms it', async () => {
  const answer = deferred<ChatMessageAck>();
  sendChatMessage.mockReturnValueOnce(answer.promise);
  await openPanel();

  send('Hello');

  expect(screen.getByText('sending…')).toBeTruthy();
  const sent = sendChatMessage.mock.calls[0][0];
  expect(sent).toMatchObject({ content: 'Hello' });
  expect(sent.clientId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);

  await act(async () => { answer.resolve({ ok: true, id: 'm-1' }); await answer.promise; });

  expect(screen.queryByText('sending…')).toBeNull();
  expect(screen.getAllByText('Hello')).toHaveLength(1);
});

it('marks a refused message Not sent, with the reason, and Retry sends it again under the same name', async () => {
  sendChatMessage.mockResolvedValueOnce({ ok: false, error: 'Rate limit: wait 30s between messages.' });
  await openPanel();

  send('Hello');

  expect(await screen.findByText(/Not sent: Rate limit: wait 30s between messages\./)).toBeTruthy();
  expect(screen.queryByText('sending…')).toBeNull();
  const firstName = sendChatMessage.mock.calls[0][0].clientId;

  sendChatMessage.mockResolvedValueOnce({ ok: true, id: 'm-1' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  await waitFor(() => expect(screen.queryByText(/Not sent/)).toBeNull());
  expect(sendChatMessage.mock.calls[1][0]).toMatchObject({ content: 'Hello', clientId: firstName });
  expect(screen.getAllByText('Hello')).toHaveLength(1);
});

it('removes a message that was not sent when it is discarded', async () => {
  sendChatMessage.mockResolvedValueOnce({ ok: false, error: 'No answer from the server' });
  await openPanel();
  send('Lost words');
  await screen.findByText(/Not sent/);

  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

  expect(screen.queryByText('Lost words')).toBeNull();
});

it('replaces its own copy by name when the message comes back, whatever its text', async () => {
  sendChatMessage.mockReturnValueOnce(new Promise(() => {}));
  await openPanel();
  send('  Spaced  out  ');
  const clientId = sendChatMessage.mock.calls[0][0].clientId;

  act(() => onMessage!(broadcast({ id: 'm-9', content: 'Spaced  out', clientId })));

  expect(screen.queryByText('sending…')).toBeNull();
  expect(screen.getAllByText(/Spaced/)).toHaveLength(1);
});

it('does not add a message it already shows', async () => {
  await openPanel();
  act(() => onMessage!(broadcast({ id: 'm-5', userId: 'them', userName: 'Them', content: 'Once' })));
  act(() => onMessage!(broadcast({ id: 'm-5', userId: 'them', userName: 'Them', content: 'Once' })));

  expect(screen.getAllByText('Once')).toHaveLength(1);
});

it('keeps messages that arrive before the history has loaded', async () => {
  const history = deferred<typeof emptyPage>();
  getMessages.mockReturnValueOnce(history.promise);
  render(<ChatPanel />);
  await waitFor(() => expect(onMessage).not.toBeNull());

  act(() => onMessage!(broadcast({ id: 'm-live', userId: 'them', userName: 'Them', content: 'Early bird' })));
  await act(async () => { history.resolve(emptyPage); await history.promise; });

  expect(await screen.findByText('Early bird')).toBeTruthy();
});

it('takes at most 2000 characters in the box', async () => {
  await openPanel();
  expect(screen.getByRole('textbox', { name: 'Chat message' }).getAttribute('maxLength')).toBe('2000');
});
