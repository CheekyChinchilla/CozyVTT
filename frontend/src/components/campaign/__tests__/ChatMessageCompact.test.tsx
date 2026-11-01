/**
 * A chat message on the compact layout takes less height.
 *
 * Chat opened at two thirds of a phone's height because at half height a
 * message's header line, its text and its padding left room for one. Chat
 * now opens at half height like Dice and Initiative, and on the compact
 * layout the sender and the time start the message's own line, at the size
 * they had, the padding is slimmer, and the text keeps its 14 px. A whisper,
 * a system message, the DM's message, one being sent and one Not sent are
 * told apart as before. The desktop is as it was.
 */

import { it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MessageType, type Message } from '@/types';
import { LayoutProvider } from '@/contexts/LayoutContext';
import ChatMessage from '../ChatMessage';

const NOW = new Date('2026-10-31T23:20:00Z');

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  campaignId: 'c1',
  userId: 'u1',
  user: { id: 'u1', displayName: 'Mara' },
  type: MessageType.PLAYER,
  content: 'Hello there',
  metadata: null,
  createdAt: '2026-10-31T23:18:00Z',
  ...over,
});

function draw(row: ReactElement, compact = true) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const view = render(<LayoutProvider compact={compact}>{row}</LayoutProvider>);
    return view.container.firstElementChild as HTMLElement;
  } finally {
    vi.useRealTimers();
  }
}

const classes = (el: Element) => el.className.split(/\s+/);

it("puts the sender and the time at the start of the message's own line", () => {
  const row = draw(<ChatMessage message={message()} />);
  const line = screen.getByText('Hello there');
  expect(line.tagName).toBe('P');
  expect(line).toHaveTextContent('Mara 2 minutes ago Hello there');
  expect(classes(line)).toEqual(expect.arrayContaining(['text-sm', 'whitespace-pre-wrap']));
  // The line is all there is, in slimmer padding.
  expect(row.children).toHaveLength(1);
  expect(classes(row)).toEqual(expect.arrayContaining(['px-2.5', 'py-1']));
  expect(classes(row)).not.toContain('p-3');
});

it('keeps your own message, a system message and the DM\'s told apart', () => {
  const mine = draw(<ChatMessage message={message()} isCurrentUser />);
  expect(within(mine).getByText(/Mara/)).toHaveTextContent('Mara (You)');

  const system = draw(<ChatMessage message={message({ type: MessageType.SYSTEM, userId: null, user: undefined, content: 'Session 5 has been resumed!' })} />);
  expect(classes(system)).toContain('bg-moss-green/10');
  expect(screen.getByText('Session 5 has been resumed!')).toHaveTextContent(/^System .* Session 5 has been resumed!$/);
  expect(system.querySelector('p svg')).not.toBeNull();

  const dm = draw(<ChatMessage message={message({ id: 'm2', type: MessageType.DM, content: 'Roll for initiative.' })} sentByDM />);
  expect(classes(dm)).toContain('bg-warning/10');
  expect(classes(within(dm).getByText('Mara'))).toContain('text-warning-ink');
  expect(dm.querySelector('p svg')).not.toBeNull();
});

it('keeps a whisper recognisable, and its name a way to whisper back', () => {
  const row = draw(
    <ChatMessage
      message={message({ type: MessageType.WHISPER, content: 'I pocket the ring.' })}
      whisperLabel="Whisper from Mara"
      whisperPeer="Mara"
      onWhisperBack={() => {}}
    />
  );
  expect(classes(row)).toContain('bg-accent/10');
  const line = screen.getByText('I pocket the ring.');
  const back = within(line).getByRole('button', { name: 'Whisper from Mara' });
  expect(back).toHaveAttribute('title', 'Whisper to Mara');
  expect(line).toHaveTextContent('Only you and Mara can see this.');
});

it('says a message is being sent, or was not sent, with Retry and Discard', () => {
  const sending = draw(<ChatMessage message={message()} isPending />);
  expect(classes(sending)).toContain('opacity-60');
  expect(screen.getByText('Hello there')).toHaveTextContent('sending…');

  const refused = draw(<ChatMessage message={message({ id: 'm3', content: 'Too fast' })} notSentReason="Slow down" />);
  expect(classes(refused)).toContain('border-danger/40');
  const status = within(refused).getByRole('status');
  expect(status).toHaveTextContent('Not sent: Slow down');
  expect(within(status).getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(within(status).getByRole('button', { name: 'Discard' })).toBeTruthy();
});

it('is as it was on the desktop: a header line over the text', () => {
  const row = draw(<ChatMessage message={message()} />, false);
  expect(row.children).toHaveLength(2);
  expect(screen.getByText('Hello there')).toHaveTextContent(/^Hello there$/);
  expect(classes(row)).toContain('p-3');
});

it('leaves one space between the sender and the text of a message not sent', () => {
  draw(<ChatMessage message={message({ content: 'Too fast' })} isCurrentUser notSentReason="Slow down" />);
  expect(screen.getByText('Too fast').textContent).toBe('Mara (You) Too fast');
});
