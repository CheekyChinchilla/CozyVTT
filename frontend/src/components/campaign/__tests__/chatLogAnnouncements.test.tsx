/**
 * What the chat log reads out to a screen reader.
 *
 * It is a live region, so every message added to it is announced. The history
 * arrives a page at a time with each Load More, and on a rejoin, and each page
 * was read out in full. It stays quiet while history is read, and announces
 * new messages.
 */
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  useReducedMotionConfig: () => false,
  motion: new Proxy({}, { get: () => (props: { children?: unknown }) => <div>{props.children as never}</div> }),
  AnimatePresence: ({ children }: { children?: unknown }) => <>{children as never}</>,
}));
vi.mock('react-router', () => ({ useParams: () => ({ id: 'campaign-1' }) }));
vi.mock('@/contexts/CampaignContext', () => ({
  useCampaign: () => ({ userRole: 'PLAYER', campaign: { id: 'campaign-1', status: 'ACTIVE', memberships: [], characters: [] } }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', displayName: 'Me' } }) }));
vi.mock('@/contexts/WebSocketContext', () => ({
  useWebSocket: () => ({
    socket: { onChatMessage: vi.fn(), onChatSystem: vi.fn(), off: vi.fn(), on: vi.fn(), isConnected: () => true, sendChatMessage: vi.fn() },
    status: 'connected', joinedEpoch: 1, reconnectCount: 0,
  }),
}));
const getMessages = vi.hoisted(() => vi.fn());
vi.mock('@/services/message.service', () => ({ getMessages }));

import ChatPanel from '../ChatPanel';

const message = (id: string) => ({
  id, campaignId: 'campaign-1', userId: 'them', content: `Message ${id}`, type: 'PLAYER', createdAt: '2026-10-19T10:00:00.000Z',
  user: { id: 'them', displayName: 'Them' },
});

it('stays quiet while Load More reads older messages, and is live again after', async () => {
  let answer: (page: unknown) => void = () => {};
  getMessages.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  render(<ChatPanel />);
  // The first page is shown in place of a loading message, so the log
  // appears with it already in and reads none of it out.
  answer({ messages: [message('m-2')], pagination: { hasMore: true, nextCursor: 'c-1' } });
  const log = await screen.findByRole('log', { name: 'Chat messages' });
  await waitFor(() => expect(log.getAttribute('aria-live')).toBe('polite'));

  fireEvent.click(await screen.findByRole('button', { name: /Load More/ }));
  await waitFor(() => expect(log.getAttribute('aria-live')).toBe('off'));
  answer({ messages: [message('m-1')], pagination: { hasMore: false, nextCursor: null } });
  await waitFor(() => expect(log.getAttribute('aria-live')).toBe('polite'));
});
