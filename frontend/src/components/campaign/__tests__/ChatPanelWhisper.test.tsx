/**
 * Whispering from the chat panel.
 *
 * A **To** list beside the box sends the next message to **Everyone** or to
 * one member: the DM in a group of their own, then those in session; `/w
 * <name> <message>` (or `/whisper`) in the box does the same for one message.
 * Display names are not unique and may hold spaces, so the list is keyed by
 * user id, no two members are ever shown alike (chatWhisper.test.ts has the
 * rule), and `/w` reads the longest name the text starts with before a unique
 * beginning of one. While the box holds a `/w`, the line under it names who
 * it will reach, with the DM's shield when it is the DM; one that fits nobody,
 * or more than one person, says so as it is typed, and is refused on send.
 *
 * The panel never turns a chosen whisper into a message to everyone: the copy
 * shown while sending keeps its recipient, and **Retry** sends it to them
 * again; a member who leaves stays chosen, marked as gone, and a message to
 * them is refused by the server and marked **Not sent**.
 *
 * A whisper shows as "Whisper to" or "Whisper from" the other person, with a
 * lock, and the DM's shield when the DM sent it; choosing that name sets the
 * **To** list to them.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { CampaignRole, MessageType } from '@/types';
import type { CampaignMembership, Character, ChatMessageAck, ChatMessageBroadcast, ChatMessageEvent, Message } from '@/types';
import { useGameStore } from '@/stores/gameStore';
import { MAX_CHAT_MESSAGE_LENGTH } from '@/constants/chatLimits';

const membership = (userId: string, displayName: string, role: CampaignRole, characterIds: string[] = []): CampaignMembership => ({
  id: `m-${userId}`, userId, campaignId: 'campaign-1', role, characterIds, joinedAt: '2026-10-01T00:00:00.000Z', user: { id: userId, displayName, avatarUrl: null },
});
const character = (id: string, userId: string, name: string) => ({ id, userId, name }) as Character;

const TABLE = [
  membership('me', 'Ash', CampaignRole.PLAYER),
  membership('dm', 'Dana', CampaignRole.DM),
  membership('mara', 'Mara', CampaignRole.PLAYER),
  membership('maralee', 'Mara Lee', CampaignRole.PLAYER),
  membership('cole', 'Cole', CampaignRole.SPECTATOR),
];
const TWO_MARAS = [
  membership('me', 'Ash', CampaignRole.PLAYER),
  membership('dm', 'Dana', CampaignRole.DM),
  membership('mara', 'Mara', CampaignRole.PLAYER, ['vex']),
  membership('mara2', 'mara', CampaignRole.SPECTATOR),
];
// A member who names themselves to look like the DM.
const LOOKALIKE_DM = [
  membership('me', 'Ash', CampaignRole.PLAYER),
  membership('dm', 'Dana', CampaignRole.DM),
  membership('fake', 'Dana (DM)', CampaignRole.PLAYER),
];

let memberships: CampaignMembership[] = TABLE;
let characters: Character[] = [];
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships, characters, chatCooldownEnabled: false } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Ash' } }) }));

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

const page = (messages: Message[]) => ({ messages, pagination: { hasMore: false, nextCursor: null } });
const stored = (fields: Partial<Message> & Pick<Message, 'id' | 'content'>): Message => ({
  campaignId: 'campaign-1', userId: 'me', user: { id: 'me', displayName: 'Ash' }, type: MessageType.PLAYER, metadata: null, createdAt: new Date().toISOString(), recipientId: null, recipient: null, ...fields,
});

const box = () => screen.getByRole('textbox', { name: 'Chat message' }) as HTMLTextAreaElement;
const picker = () => screen.getByRole('combobox', { name: 'To' }) as HTMLSelectElement;

async function openPanel() {
  const view = render(<ChatPanel />);
  await screen.findByRole('textbox', { name: 'Chat message' });
  return view;
}

function type(text: string) {
  fireEvent.change(box(), { target: { value: text } });
}

function send(text: string) {
  type(text);
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  memberships = TABLE;
  characters = [];
  onMessage = null;
  sendChatMessage.mockReset();
  sendChatMessage.mockReturnValue(new Promise(() => {}));
  getMessages.mockReset();
  getMessages.mockResolvedValue(page([]));
  useGameStore.getState().clearGameState();
});

it('lists Everyone, the DM in a group of their own, then every other member by id, those in session first', async () => {
  useGameStore.getState().setOnlineUserIds(['me', 'cole', 'mara']);
  await openPanel();

  const options = within(picker()).getAllByRole('option').map((o) => [(o as HTMLOptionElement).value, o.textContent]);
  expect(options).toEqual([['', 'Everyone'], ['dm', 'Dana'], ['cole', 'Cole'], ['mara', 'Mara'], ['maralee', 'Mara Lee']]);
  expect(within(picker()).getAllByRole('group').map((g) => g.getAttribute('label'))).toEqual(['DM, not in session', 'In session', 'Not in session']);
  expect(picker().value).toBe('');

  act(() => useGameStore.getState().setOnlineUserIds(['dm']));
  expect(within(picker()).getAllByRole('group')[0].getAttribute('label')).toBe('DM');
});

it('keeps the DM alone in the DM group, and shows the DM\'s shield beside the real DM alone', async () => {
  memberships = LOOKALIKE_DM;
  await openPanel();

  const groups = within(picker()).getAllByRole('group');
  expect(within(groups[0]).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)).toEqual(['dm']);
  expect(within(groups[1]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Dana (DM)']);

  fireEvent.change(picker(), { target: { value: 'fake' } });
  expect(screen.getByText('Only you and Dana (DM) can see this.').closest('p')!.querySelector('.lucide-shield')).toBeNull();

  fireEvent.change(picker(), { target: { value: 'dm' } });
  expect(screen.getByText('Only you and Dana can see this.').closest('p')!.querySelector('.lucide-shield')).not.toBeNull();
});

it('tells two members of one name apart by character or role', async () => {
  memberships = TWO_MARAS;
  characters = [character('vex', 'mara', 'Vex')];
  await openPanel();

  const names = within(picker()).getAllByRole('option').map((o) => o.textContent);
  expect(names).toEqual(['Everyone', 'Dana', 'Mara (Player, Vex)', 'mara (Spectator)']);
});

it('sends to the member chosen, and shows the message as a whisper while it goes', async () => {
  await openPanel();
  fireEvent.change(picker(), { target: { value: 'mara' } });
  expect(screen.getByText('Only you and Mara can see this.')).toBeTruthy();

  send('Meet me by the well');

  expect(sendChatMessage.mock.calls[0][0]).toMatchObject({ content: 'Meet me by the well', type: 'PLAYER', recipientId: 'mara' });
  expect(screen.getByText('Whisper to Mara')).toBeTruthy();
  expect(screen.getByText('sending…')).toBeTruthy();
});

it('sends a message to everyone with no recipient', async () => {
  await openPanel();
  send('Hello, all');
  expect(sendChatMessage.mock.calls[0][0]).not.toHaveProperty('recipientId');
});

it('retries a whisper that was not sent to the same person, whatever the To list says now', async () => {
  sendChatMessage.mockResolvedValueOnce({ ok: false, error: 'No answer from the server' });
  await openPanel();
  fireEvent.change(picker(), { target: { value: 'mara' } });
  send('Did you get this?');
  await screen.findByText(/Not sent: No answer from the server/);

  fireEvent.change(picker(), { target: { value: '' } });
  sendChatMessage.mockResolvedValueOnce({ ok: true, id: 'w-1' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  const [first, again] = sendChatMessage.mock.calls.map(([sent]) => sent);
  expect(again).toEqual({ content: 'Did you get this?', type: 'PLAYER', clientId: first.clientId, recipientId: 'mara' });
});

it('keeps a member who left chosen, says they left, and sends nothing to everyone in their place', async () => {
  const view = await openPanel();
  fireEvent.change(picker(), { target: { value: 'mara' } });

  memberships = TABLE.filter((m) => m.userId !== 'mara');
  view.rerender(<ChatPanel />);

  expect(picker().value).toBe('mara');
  expect(within(picker()).getByRole('option', { name: 'Mara (no longer in the campaign)' })).toBeTruthy();
  expect(screen.getByText('Mara is no longer in the campaign.')).toBeTruthy();

  sendChatMessage.mockResolvedValueOnce({ ok: false, error: 'That person is not in this campaign' });
  send('Still there?');

  expect(sendChatMessage.mock.calls[0][0]).toMatchObject({ recipientId: 'mara' });
  expect(await screen.findByText(/Not sent: That person is not in this campaign/)).toBeTruthy();
});

it.each([
  ['/w Mara Lee Over here', 'maralee', 'Over here'],
  ['/w mara  hi there', 'mara', 'hi there'],
  ['/W Co psst', 'cole', 'psst'],
  ['/whisper Mara hi', 'mara', 'hi'],
])('sends %p to the member it names, with the rest as the message', async (text, recipientId, content) => {
  await openPanel();
  send(text);
  expect(sendChatMessage.mock.calls[0][0]).toMatchObject({ recipientId, content });
  expect(picker().value).toBe('');
});

it.each([
  ['/w Ma hi', TABLE, 'That name fits more than one person: Mara, Mara Lee. Choose one in the To list.'],
  ['/w Mara hi', TWO_MARAS, 'That name fits more than one person: Mara (Player, Vex), mara (Spectator). Choose one in the To list.'],
  ['/w Zed hi', TABLE, 'Nobody in this campaign is called "Zed".'],
  ['/w Mara', TABLE, 'Write your message after the name.'],
])('refuses %p itself, and sends it to no one', async (text, table, refusal) => {
  memberships = table;
  characters = [character('vex', 'mara', 'Vex')];
  await openPanel();

  send(text);

  expect(screen.getByRole('alert').textContent).toBe(refusal);
  expect(sendChatMessage).not.toHaveBeenCalled();
  expect(box().value).toBe(text);
  type(`${text}!`);
  expect(screen.queryByRole('alert')).toBeNull();
});

it('names, under the box, whoever a typed /w will reach, whatever the To list says', async () => {
  await openPanel();
  fireEvent.change(picker(), { target: { value: 'mara' } });

  type('/w Cole hi');
  expect(screen.getByText('Only you and Cole can see this.')).toBeTruthy();
  expect(screen.queryByText('Only you and Mara can see this.')).toBeNull();

  type('/whisper Dana roll for it');
  expect(screen.getByText('Only you and Dana can see this.').closest('p')!.querySelector('.lucide-shield')).not.toBeNull();

  type('/w Ma hi');
  expect(screen.getByText('That name fits more than one person: Mara, Mara Lee. Choose one in the To list.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();

  type('Back to Mara');
  expect(screen.getByText('Only you and Mara can see this.')).toBeTruthy();
});

it('shows a whisper with the other person\'s name, a lock, and the DM\'s shield on the DM\'s', async () => {
  getMessages.mockResolvedValue(page([
    stored({ id: 'w-3', content: 'From the DM', userId: 'dm', user: { id: 'dm', displayName: 'Dana' }, type: MessageType.WHISPER, recipientId: 'me', recipient: { id: 'me', displayName: 'Ash' } }),
    stored({ id: 'w-2', content: 'To Cole', type: MessageType.WHISPER, recipientId: 'cole', recipient: { id: 'cole', displayName: 'Cole' } }),
    stored({ id: 'w-1', content: 'From Mara', userId: 'mara', user: { id: 'mara', displayName: 'Mara' }, type: MessageType.WHISPER, recipientId: 'me', recipient: { id: 'me', displayName: 'Ash' } }),
  ]));
  const { container } = await openPanel();

  const rows = (name: string) => screen.getByRole('button', { name }).closest('[data-message-id]')!;
  expect(await screen.findByRole('button', { name: 'Whisper from Mara' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Whisper to Cole' })).toBeTruthy();
  expect(rows('Whisper from Mara').querySelector('.lucide-lock')).not.toBeNull();
  expect(rows('Whisper from Mara').textContent).toContain('Only you and Mara can see this.');
  expect(rows('Whisper from Dana').querySelector('.lucide-shield')).not.toBeNull();
  expect(rows('Whisper from Mara').querySelector('.lucide-shield')).toBeNull();
  expect(container.querySelectorAll('.lucide-lock')).toHaveLength(3);
});

it('sets the To list to the other person when a whisper\'s name is chosen', async () => {
  getMessages.mockResolvedValue(page([
    stored({ id: 'w-1', content: 'From Mara', userId: 'mara', user: { id: 'mara', displayName: 'Mara' }, type: MessageType.WHISPER, recipientId: 'me', recipient: { id: 'me', displayName: 'Ash' } }),
  ]));
  await openPanel();

  fireEvent.click(await screen.findByRole('button', { name: 'Whisper from Mara' }));

  expect(picker().value).toBe('mara');
  await waitFor(() => expect(document.activeElement).toBe(box()));
});

it('shows a whisper that arrives live as one', async () => {
  await openPanel();
  act(() => onMessage!({ id: 'w-9', userId: 'mara', userName: 'Mara', content: 'Psst', type: MessageType.WHISPER, recipientId: 'me', recipientName: 'Ash', timestamp: new Date().toISOString() }));
  expect(screen.getByRole('button', { name: 'Whisper from Mara' })).toBeTruthy();
});

it('lets the box hold a full message after the /w prefix', async () => {
  await openPanel();
  expect(box().maxLength).toBe(MAX_CHAT_MESSAGE_LENGTH);
  type('/w Mara ');
  expect(box().maxLength).toBeGreaterThanOrEqual(MAX_CHAT_MESSAGE_LENGTH + '/w '.length + 50 + 1);
});
