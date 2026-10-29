/**
 * The chat in the compact layout's Chat sheet.
 *
 * A half sheet on a phone is about 330 px tall. The panel's own header, a
 * two-line message box and the line about Enter and Shift+Enter took nearly
 * all of it, so the log had a sliver. On the compact layout the sheet's
 * heading names the chat, so the panel's heading is kept for screen readers
 * only, the box is one line to start with, with a placeholder that fits
 * it, and the hint about the keys is read out but not shown. The desktop is as it was.
 */

import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MessageHistoryPage } from '@/types';
import { LayoutProvider } from '@/contexts/LayoutContext';

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

async function open(compact: boolean) {
  render(<LayoutProvider compact={compact}><ChatPanel /></LayoutProvider>);
  return screen.findByRole('textbox', { name: 'Chat message' });
}

const classes = (el: Element) => el.className.split(/\s+/);

it('gives the log the room on the compact layout: the heading for screen readers, a one-line box, the hint not shown', async () => {
  const box = await open(true);
  expect(classes(screen.getByRole('heading', { name: 'Chat' }))).toContain('sr-only');
  expect(box).toHaveAttribute('rows', '1');
  expect(classes(box)).not.toContain('min-h-[60px]');
  expect(classes(screen.getByText('Press Enter to send, Shift+Enter for new line'))).toContain('sr-only');
  expect(box).toHaveAccessibleDescription('Press Enter to send, Shift+Enter for new line');
  // One line holds the short form, beside To and Send in a sheet 352 px wide.
  expect(box).toHaveAttribute('placeholder', 'Message…');
  // The To list is a finger's height, on one row with the box and Send, and
  // wide enough to show Everyone whole (about 111 px with its arrow at 16 px
  // text). The three keep their sides narrow, so in the 352 px sheet of a
  // phone on its side the box still holds its placeholder on one line.
  const toList = screen.getByRole('combobox', { name: 'To' });
  expect(classes(toList)).toEqual(expect.arrayContaining(['min-h-11', 'w-32', 'px-2.5']));
  expect(classes(box)).toContain('px-2.5');
  expect(classes(screen.getByRole('button', { name: 'Send message' }))).toContain('px-3');
  expect(toList.parentElement).toBe(box.parentElement);
  expect(box.parentElement).toContainElement(screen.getByRole('button', { name: 'Send message' }));
});

it('keeps the box, its draft and its focus as the arrangement changes', async () => {
  const { rerender } = render(<LayoutProvider compact={false}><ChatPanel /></LayoutProvider>);
  const box = await screen.findByRole('textbox', { name: 'Chat message' });
  fireEvent.change(box, { target: { value: 'draft' } });
  box.focus();
  for (const compact of [true, false, true]) {
    rerender(<LayoutProvider compact={compact}><ChatPanel /></LayoutProvider>);
    expect(screen.getByRole('textbox', { name: 'Chat message' })).toBe(box);
    expect(document.activeElement).toBe(box);
  }
  expect(box).toHaveValue('draft');
});

it('is as it was on the desktop', async () => {
  const box = await open(false);
  expect(classes(screen.getByRole('heading', { name: 'Chat' }))).not.toContain('sr-only');
  expect(box).toHaveAttribute('rows', '2');
  expect(classes(box)).toContain('min-h-[60px]');
  expect(classes(screen.getByText('Press Enter to send, Shift+Enter for new line'))).not.toContain('sr-only');
  expect(box).toHaveAttribute('placeholder', 'Type a message... (Enter to send, Shift+Enter for new line)');
  expect(classes(screen.getByRole('combobox', { name: 'To' }))).not.toContain('min-h-11');
});
