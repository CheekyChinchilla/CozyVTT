/**
 * A system notice in the chat (a session paused or resumed, the spirit layer
 * shown or hidden) is one quiet centred line, on the compact layout and on
 * the desktop, so people's messages stand out. It was a full card, as heavy
 * as a message.
 */
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageType, type Message } from '@/types';
import { LayoutProvider } from '@/contexts/LayoutContext';
import ChatMessage from '../ChatMessage';

const NOW = new Date('2026-10-31T23:20:00Z');

const notice: Message = {
  id: 'm1', campaignId: 'campaign-1', userId: null, type: MessageType.SYSTEM, content: 'Session 5 has been resumed!',
  createdAt: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
} as unknown as Message;

function draw(compact: boolean) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  try {
    const view = render(<LayoutProvider compact={compact}><ChatMessage message={notice} /></LayoutProvider>);
    return view.container.firstElementChild as HTMLElement;
  } finally {
    vi.useRealTimers();
  }
}

it.each([[true], [false]])('draws a system notice as a quiet centred line (compact %s)', (compact) => {
  const line = draw(compact);
  const classes = line.className.split(/\s+/);
  expect(classes).toEqual(expect.arrayContaining(['text-center', 'text-xs']));
  expect(classes).not.toContain('border');
  expect(classes.some((c) => c.startsWith('bg-'))).toBe(false);
  expect(line).toHaveTextContent('System: Session 5 has been resumed! · 5 minutes ago');
  expect(screen.queryByText('System')).toBeNull();
});
