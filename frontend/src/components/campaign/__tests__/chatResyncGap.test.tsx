/**
 * Coming back after a long disconnect fills in every message missed.
 *
 * The page re-read only the newest 50 messages when it rejoined. A busier
 * absence left the rest missing for good, since Load More pages back from the
 * oldest message on screen, behind the gap. It now pages back until it meets
 * a message it already has; after 10 pages it starts the list again from the
 * newest, so nothing in between is missing.
 */

import { it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import type { Message } from '@/types';

const ws = { joinedEpoch: 1 };
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({ socket: { onChatMessage: vi.fn(), onChatSystem: vi.fn(), off: vi.fn(), sendChatMessage: vi.fn() }, joinedEpoch: ws.joinedEpoch }),
}));
const getMessages = vi.fn();
vi.mock('@/services/message.service', () => ({ getMessages: (...a: unknown[]) => getMessages(...a) }));
vi.mock('@/services/api', () => ({ api: {}, default: {} }));

import ChatPanel from '../ChatPanel';

/** Message n, sent n minutes after the first. */
const message = (n: number): Message => ({
  id: `m-${String(n).padStart(3, '0')}`, campaignId: 'campaign-1', userId: 'them', user: { id: 'them', displayName: 'Them' },
  type: 'PLAYER', content: `Message ${n}`, metadata: null, createdAt: new Date(Date.UTC(2026, 9, 18, 19, n)).toISOString(),
} as unknown as Message);
/** Messages from..to, newest first, as the server pages them. */
const newestFirst = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => message(to - i));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { value: () => undefined, configurable: true });
});

beforeEach(() => {
  ws.joinedEpoch = 1;
  getMessages.mockReset();
});

it('pages back after a rejoin until it meets a message it has', async () => {
  getMessages.mockResolvedValueOnce({ messages: newestFirst(1, 3), pagination: { hasMore: false, nextCursor: null } });
  const view = render(<ChatPanel />);
  await screen.findByText('Message 3');

  // While away, messages 4 to 60 were sent: the newest page reaches back to 11.
  getMessages
    .mockResolvedValueOnce({ messages: newestFirst(11, 60), pagination: { hasMore: true, nextCursor: 'before-11' } })
    .mockResolvedValueOnce({ messages: newestFirst(1, 10), pagination: { hasMore: false, nextCursor: null } });
  ws.joinedEpoch = 2;
  await act(async () => { view.rerender(<ChatPanel />); });

  await waitFor(() => expect(screen.getByText('Message 60')).toBeTruthy());
  for (const n of [4, 7, 10, 11]) expect(screen.getByText(`Message ${n}`)).toBeTruthy();
  expect(getMessages).toHaveBeenLastCalledWith('campaign-1', 50, 'before-11');
  expect(screen.getAllByText(/^Message \d+$/)).toHaveLength(60);
});
